import asyncio
from typing import Any, Dict, List, Optional

from ..schemas.goal import Goal, GoalContextItem, GoalProgress, MicroStep
from ..agent.utils.nanoid import nanoid

_goals: Dict[str, Goal] = {}
_lock = asyncio.Lock()


def _default_goal_progress(micro_steps: List[MicroStep]) -> GoalProgress:
    total = len(micro_steps)
    completed = len([step for step in micro_steps if step.completed])
    ratio = completed / total if total else 0
    return GoalProgress(completed=completed, total=total, ratio=ratio)


async def create_goal(params: Dict[str, Any]) -> Goal:
    async with _lock:
        goal_id = params.get("id") or nanoid()
        micro_steps = [
            MicroStep(
                id=step.get("id") or nanoid(),
                description=step.get("description") or "",
                completed=bool(step.get("completed")),
                completed_at=step.get("completed_at"),
            )
            for step in params.get("micro_steps", [])
        ]
        goal = Goal(
            id=goal_id,
            user_id=params.get("user_id") or "user-stub",
            title=params.get("title") or "Untitled goal",
            description=params.get("description"),
            category=params.get("category"),
            target_date=params.get("target_date"),
            status=params.get("status") or "active",
            current_step=params.get("current_step"),
            micro_steps=micro_steps,
            source_entry_id=params.get("source_entry_id"),
            metadata=params.get("metadata") or {},
            embedding=params.get("embedding"),
            created_at=params.get("created_at") or "",
            updated_at=params.get("updated_at") or "",
        )
        _goals[goal.id] = goal
        return goal


async def get_goal_by_id(goal_id: str) -> Optional[Goal]:
    async with _lock:
        return _goals.get(goal_id)


async def list_goals(options: Optional[Dict[str, Any]] = None) -> List[Goal]:
    status = options.get("status") if options else None
    limit = options.get("limit") if options else None
    async with _lock:
        goals = list(_goals.values())
        if status:
            goals = [goal for goal in goals if goal.status == status]
        return goals[:limit] if isinstance(limit, int) else goals


async def update_goal(goal_id: str, updates: Dict[str, Any]) -> Goal:
    async with _lock:
        existing = _goals.get(goal_id)
        if not existing:
            raise ValueError("Goal not found")
        updated = existing.model_copy(update=updates)
        _goals[goal_id] = updated
        return updated


async def delete_goal(goal_id: str) -> None:
    async with _lock:
        _goals.pop(goal_id, None)


async def complete_micro_step(goal_id: str, step_id: str) -> Goal:
    async with _lock:
        goal = _goals.get(goal_id)
        if not goal:
            raise ValueError("Goal not found")
        steps = []
        for step in goal.micro_steps:
            if step.id == step_id:
                steps.append(step.model_copy(update={"completed": True}))
            else:
                steps.append(step)
        updated = goal.model_copy(update={"micro_steps": steps})
        _goals[goal_id] = updated
        return updated


async def add_micro_step(goal_id: str, description: str) -> Goal:
    async with _lock:
        goal = _goals.get(goal_id)
        if not goal:
            raise ValueError("Goal not found")
        steps = list(goal.micro_steps) + [MicroStep(id=nanoid(), description=description, completed=False, completed_at=None)]
        updated = goal.model_copy(update={"micro_steps": steps})
        _goals[goal_id] = updated
        return updated


async def list_active_goals_with_context(uid: Optional[str] = None, limit: int = 5) -> List[GoalContextItem]:
    goals = await list_goals({"status": "active", "limit": limit})
    context_items: List[GoalContextItem] = []
    for goal in goals:
        progress = _default_goal_progress(goal.micro_steps)
        context_items.append(
            GoalContextItem(
                id=goal.id,
                title=goal.title,
                status=goal.status,
                priority_score=0.5,
                target_date=goal.target_date,
                current_step=goal.current_step,
                micro_steps=goal.micro_steps,
                progress=progress,
                description=goal.description,
                updated_at=goal.updated_at,
                metadata=goal.metadata,
                source_entry_id=goal.source_entry_id,
                conflicts=[],
                linked_entries=[],
            )
        )
    return context_items
