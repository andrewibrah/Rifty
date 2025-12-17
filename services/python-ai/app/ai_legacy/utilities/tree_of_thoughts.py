from typing import Any, Dict, List, Optional

from ..pipeline import complexity_score
from ..schemas.validator import SchemaType, validate_against_schema


class TreeOfThoughts:
    def __init__(self, enabled: bool = True, breadth: int = 3, depth: int = 2, min_complexity: float = 0.8, required_persona: str = "analyst") -> None:
        self.config = {
            "enabled": enabled,
            "breadth": breadth,
            "depth": depth,
            "minComplexity": min_complexity,
            "requiredPersona": required_persona,
        }

    async def should_use_tot(self, input_payload: Dict[str, Any], persona: str, schema: SchemaType) -> bool:
        if not self.config["enabled"]:
            return False
        if persona != self.config["requiredPersona"]:
            return False
        complexity = complexity_score(input_payload)
        return complexity >= self.config["minComplexity"]

    async def explore_thoughts(self, initial_prompt: str, input_payload: Dict[str, Any], persona: str, schema: SchemaType) -> Optional[Dict[str, Any]]:
        if not await self.should_use_tot(input_payload, persona, schema):
            return None
        root = {"id": "root", "content": {"initial": True}, "depth": 0, "score": 0, "valid": True, "children": []}
        await self._explore_level(root, initial_prompt, schema)
        return self._find_best_leaf(root)

    async def _explore_level(self, node: Dict[str, Any], prompt: str, schema: SchemaType) -> None:
        if node["depth"] >= self.config["depth"]:
            return
        for i in range(self.config["breadth"]):
            thought = await self._mock_generate_thought(prompt, self._build_context_from_path(node))
            validation = validate_against_schema(schema, thought)
            score = self._score_thought(thought, validation["valid"], prompt)
            child = {
                "id": f"{node['id']}-{i}",
                "content": thought,
                "parentId": node["id"],
                "depth": node["depth"] + 1,
                "score": score,
                "valid": validation["valid"],
                "children": [],
            }
            node["children"].append(child)
            if validation["valid"] and score > 0.7:
                await self._explore_level(child, prompt, schema)

    async def _mock_generate_thought(self, prompt: str, context: List[str]) -> Any:
        return {"thought": f"Thought based on {', '.join(context)}"}

    def _build_context_from_path(self, node: Dict[str, Any]) -> List[str]:
        context: List[str] = []
        current: Optional[Dict[str, Any]] = node
        while current:
            if isinstance(current.get("content"), dict):
                context.insert(0, str(current["content"]))
            parent_id = current.get("parentId")
            current = self._find_node_by_id(parent_id, node) if parent_id else None
        return context

    def _find_node_by_id(self, node_id: Optional[str], root: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        if not node_id:
            return None
        if root["id"] == node_id:
            return root
        for child in root.get("children", []):
            found = self._find_node_by_id(node_id, child)
            if found:
                return found
        return None

    def _score_thought(self, thought: Any, is_valid: bool, objective: str) -> float:
        score = 0.5 if is_valid else 0.0
        thought_str = str(thought).lower()
        objective_words = objective.lower().split()
        coverage = len([word for word in objective_words if word in thought_str]) / max(len(objective_words), 1)
        score += coverage * 0.5
        return min(score, 1.0)

    def _find_best_leaf(self, root: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        leaves: List[Dict[str, Any]] = []

        def collect(node: Dict[str, Any]) -> None:
            if not node.get("children"):
                leaves.append(node)
                return
            for child in node.get("children", []):
                collect(child)

        collect(root)
        if not leaves:
            return None
        return max(leaves, key=lambda leaf: leaf.get("score", 0))


tree_of_thoughts = TreeOfThoughts()
