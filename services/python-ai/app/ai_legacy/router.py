import json
from pathlib import Path
from typing import Any, Dict, List, Optional

import yaml

from .gate import generate_fast_path_response, gate_request
from .middleware.principle_anchor import principle_anchor
from .pipeline import run_pipeline
from .utilities.pal_mode import pal_mode
from .utilities.self_consistency import self_consistency_voter
from .utilities.tree_of_thoughts import tree_of_thoughts


class CognitionRouter:
    def __init__(self, personas_path: Optional[Path] = None, default_persona: str = "coach", max_lessons: int = 3) -> None:
        self.config = {
            "personasPath": personas_path or Path(__file__).parent / "personas",
            "defaultPersona": default_persona,
            "maxLessons": max_lessons,
        }
        self.personas: Dict[str, Dict[str, Any]] = {}
        self._load_personas()

    def _load_personas(self) -> None:
        persona_files = ["coach.yaml", "analyst.yaml", "mirror.yaml", "scheduler.yaml"]
        for file in persona_files:
            try:
                file_path = self.config["personasPath"] / file
                content = file_path.read_text(encoding="utf-8")
                persona = self._parse_yaml_persona(file_path, content)
                if persona:
                    self.personas[persona["name"]] = persona
            except Exception as error:  # pylint: disable=broad-except
                continue
        if not self.personas:
            raise RuntimeError("No personas could be loaded from configuration")

    def _parse_yaml_persona(self, file_path: Path, content: str) -> Optional[Dict[str, Any]]:
        try:
            parsed = yaml.safe_load(content)
            if not isinstance(parsed, dict):
                raise ValueError("Persona file did not produce an object")
            persona_doc = {
                "name": str(parsed.get("name")),
                "dna": str(parsed.get("dna")),
                "tone": str(parsed.get("tone")),
                "forbidden_behaviors": parsed.get("forbidden_behaviors") or [],
                "tool_allowlist": parsed.get("tool_allowlist") or [],
            }
            return persona_doc
        except Exception:
            return None

    def _select_persona(self, intent: str, context: Any) -> Dict[str, Any]:
        if intent == "reflection":
            requested = "mirror"
        elif intent == "analysis":
            requested = "analyst"
        elif intent == "scheduling":
            requested = "scheduler"
        else:
            requested = self.config["defaultPersona"]
        persona = self.personas.get(requested) or self.personas.get(self.config["defaultPersona"])
        if not persona:
            raise RuntimeError("Persona selection failed")
        return persona

    def _compose_system_prompt(self, persona: Dict[str, Any], lessons: List[str]) -> str:
        recent = lessons[-self.config["maxLessons"] :]
        prompt = persona["dna"]
        if recent:
            prompt += "\n\nRecent Lessons:\n" + "\n".join(f"{idx + 1}. {lesson}" for idx, lesson in enumerate(recent))
        prompt = principle_anchor.inject_principle(prompt)
        return prompt

    async def route(self, input_payload: Dict[str, Any]) -> Dict[str, Any]:
        gate_result = await gate_request({"userMessage": input_payload.get("userMessage", ""), "context": input_payload.get("context")})
        if gate_result["route"] == "fast_path":
            response = generate_fast_path_response(gate_result, {"userMessage": input_payload.get("userMessage", "")})
            return {"response": response, "actions": [], "version": "cognition.v1", "diagnostics": {"gate": gate_result}}
        persona = self._select_persona(gate_result["intent"], input_payload.get("context"))
        system_prompt = self._compose_system_prompt(persona, input_payload.get("lessons") or [])
        pipeline_result = await self._run_enhanced_pipeline(input_payload, persona["name"], system_prompt)
        nudged = principle_anchor.nudge_response(pipeline_result, input_payload)
        return {
            "response": nudged["nudged"]["response"] if isinstance(nudged.get("nudged"), dict) else nudged["nudged"],
            "actions": nudged["nudged"].get("actions") if isinstance(nudged.get("nudged"), dict) else [],
            "version": "cognition.v1",
            "diagnostics": {"gate": gate_result, "persona": persona["name"], "pipeline": pipeline_result, "nudged": nudged.get("wasNudged")},
        }

    async def _run_enhanced_pipeline(self, input_payload: Dict[str, Any], persona_name: str, system_prompt: str) -> Dict[str, Any]:
        pal_result = await pal_mode.execute_pal(input_payload)
        pipeline_result = await run_pipeline({"userMessage": input_payload.get("userMessage", ""), "context": input_payload.get("context", {})})
        if persona_name == "analyst":
            tot_result = await tree_of_thoughts.explore_thoughts(system_prompt, input_payload, persona_name, "plan")
            if tot_result:
                pipeline_result["tot"] = tot_result
        sc_result = await self_consistency_voter.generate_consistent_response(system_prompt, "plan", input_payload)
        if sc_result:
            pipeline_result["selfConsistency"] = sc_result
        if pal_result:
            pipeline_result["pal"] = pal_result
        return pipeline_result


cognition_router = CognitionRouter()
