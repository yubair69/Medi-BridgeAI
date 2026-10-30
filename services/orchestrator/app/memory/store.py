"""In-process per-session memory store. A plain dict guarded by nothing
fancier than Python's GIL is adequate for a single-process dev/demo
deployment; multi-instance/persistent storage (Postgres/Redis, per
Blueprint Section 4) is Phase 9 infra hardening, explicitly out of scope
here (Blueprint Section 6.2: work in vertical slices, don't build
persistence infra a feature doesn't need yet).

Not persisted across process restarts -- matches Section 2.2's "Persisted
per session only, cleared/archived at session end per retention policy":
clear_session() is the "cleared" half of that; real archival storage is
deferred alongside the Postgres/Redis wiring above.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from app.memory.schemas import (
    AddCaseMemoryEntryRequest,
    AddDismissedAlertRequest,
    AppendUtteranceRequest,
    CaseMemoryEntry,
    DismissedAlert,
    SessionMemory,
    Utterance,
)
from app.summary.client import ClinicalNlpSummarizer
from app.summary.schemas import StructuredSummary
from app.timeline.schemas import AddTimelineEventRequest, TimelineEvent, TimelineEventType


class SessionNotFoundError(KeyError):
    pass


class CaseMemoryEntryNotFoundError(KeyError):
    pass


class NoDraftSummaryError(KeyError):
    pass


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class MemoryStore:
    def __init__(self) -> None:
        self._sessions: dict[str, SessionMemory] = {}

    def _get_or_create(self, session_id: str) -> SessionMemory:
        if session_id not in self._sessions:
            self._sessions[session_id] = SessionMemory(
                session_id=session_id,
                utterances=[],
                case_memory=[],
                dismissed_alerts=[],
                timeline=[],
                draft_summary=None,
                summary_approved=False,
            )
        return self._sessions[session_id]

    def append_utterance(self, session_id: str, request: AppendUtteranceRequest) -> Utterance:
        memory = self._get_or_create(session_id)
        utterance = Utterance(
            id=uuid.uuid4().hex,
            speaker=request.speaker,
            original_text=request.original_text,
            translated_text=request.translated_text,
            sequence=len(memory.utterances),
        )
        memory.utterances.append(utterance)
        return utterance

    def add_case_memory_entry(self, session_id: str, request: AddCaseMemoryEntryRequest) -> CaseMemoryEntry:
        memory = self._get_or_create(session_id)
        entry = CaseMemoryEntry(
            id=uuid.uuid4().hex,
            category=request.category,
            value=request.value,
            source_utterance_id=request.source_utterance_id,
        )
        memory.case_memory.append(entry)
        return entry

    def remove_case_memory_entry(self, session_id: str, entry_id: str) -> None:
        """Clinician-editable removal (Blueprint Section 2.4: "explicit
        chips, editable/removable by clinician") -- raises rather than
        silently no-op-ing on an unknown id, so a UI bug (double-click,
        stale state) surfaces instead of hiding a real problem."""
        if session_id not in self._sessions:
            raise SessionNotFoundError(session_id)
        memory = self._sessions[session_id]
        before = len(memory.case_memory)
        memory.case_memory = [e for e in memory.case_memory if e.id != entry_id]
        if len(memory.case_memory) == before:
            raise CaseMemoryEntryNotFoundError(entry_id)

    def add_dismissed_alert(self, session_id: str, request: AddDismissedAlertRequest) -> DismissedAlert:
        memory = self._get_or_create(session_id)
        entry = DismissedAlert(
            id=uuid.uuid4().hex, reason=request.reason, source_utterance_id=request.source_utterance_id
        )
        memory.dismissed_alerts.append(entry)
        # Auto-appended, not a separate call from anywhere else -- dismissal
        # already goes through this store, so it's the natural place for
        # the corresponding timeline entry to originate (Blueprint Section
        # 2.2: "alert triggered" is one of the timeline's four event
        # types; "alert dismissed" is its natural counterpart).
        self._append_timeline_event(
            memory, event_type="alert_dismissed", description=f"Alert dismissed: {request.reason}",
            source_utterance_id=request.source_utterance_id,
        )
        return entry

    def add_timeline_event(self, session_id: str, request: AddTimelineEventRequest) -> TimelineEvent:
        memory = self._get_or_create(session_id)
        # Deduplicate: skip if an identical (type, description) event already
        # exists from the same source utterance — prevents ASR hallucination
        # loops (e.g. "Aspirin, Aspirin, Aspirin...") from spamming the timeline.
        if any(
            e.type == request.type
            and e.description == request.description
            and e.source_utterance_id == request.source_utterance_id
            for e in memory.timeline
        ):
            return memory.timeline[-1] if memory.timeline else self._append_timeline_event(
                memory, event_type=request.type, description=request.description,
                source_utterance_id=request.source_utterance_id,
            )
        return self._append_timeline_event(
            memory, event_type=request.type, description=request.description,
            source_utterance_id=request.source_utterance_id,
        )

    def _append_timeline_event(
        self,
        memory: SessionMemory,
        *,
        event_type: TimelineEventType,
        description: str,
        source_utterance_id: str | None,
    ) -> TimelineEvent:
        event = TimelineEvent(
            id=uuid.uuid4().hex,
            type=event_type,
            description=description,
            source_utterance_id=source_utterance_id,
            timestamp=_now_iso(),
        )
        memory.timeline.append(event)
        return event

    async def generate_summary(self, session_id: str, summarizer: ClinicalNlpSummarizer) -> StructuredSummary:
        """Always regenerates from this session's current utterances and
        always resets summary_approved to False -- a new draft supersedes
        whatever was approved before, per SessionMemory's own docstring."""
        memory = self._get_or_create(session_id)
        summary = await summarizer.summarize(memory.utterances)
        memory.draft_summary = summary
        memory.summary_approved = False
        return summary

    def approve_summary(self, session_id: str) -> None:
        """Blueprint Section 2.4: "AI Consultation Summary (draft,
        clinician must review/approve before export -- never
        auto-finalized)" -- raises if there's no draft to approve, rather
        than silently marking a nonexistent summary approved."""
        if session_id not in self._sessions:
            raise SessionNotFoundError(session_id)
        memory = self._sessions[session_id]
        if memory.draft_summary is None:
            raise NoDraftSummaryError(session_id)
        memory.summary_approved = True

    def get_memory(self, session_id: str) -> SessionMemory:
        if session_id not in self._sessions:
            raise SessionNotFoundError(session_id)
        return self._sessions[session_id]

    def clear_session(self, session_id: str) -> None:
        self._sessions.pop(session_id, None)
