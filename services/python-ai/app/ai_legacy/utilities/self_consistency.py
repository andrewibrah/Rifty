from typing import Any, Dict, List, Optional

from ..pipeline import complexity_score
from ..schemas.validator import SchemaType, validate_against_schema


class SelfConsistencyVoter:
    def __init__(self, enabled: bool = True, k: int = 5, temperatures: Optional[List[float]] = None, min_complexity: float = 0.6, target_schema: SchemaType = "plan") -> None:
        self.config = {
            "enabled": enabled,
            "k": k,
            "temperatures": temperatures or [0.3, 0.5, 0.7, 0.9, 1.1],
            "minComplexity": min_complexity,
            "targetSchema": target_schema,
        }

    async def should_use_self_consistency(self, input_payload: Dict[str, Any], schema: SchemaType) -> bool:
        if not self.config["enabled"]:
            return False
        if schema != self.config["targetSchema"]:
            return False
        complexity = complexity_score(input_payload)
        return complexity >= self.config["minComplexity"]

    async def generate_consistent_response(self, prompt: str, schema: SchemaType, input_payload: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        if not await self.should_use_self_consistency(input_payload, schema):
            return None
        samples: List[Any] = []
        temps = self.config["temperatures"]
        if not temps:
            raise ValueError("No temperatures configured for self-consistency voting")
        for i in range(self.config["k"]):
            temp = temps[i % len(temps)]
            sample = await self._mock_llm_call(prompt, temp, schema)
            validation = validate_against_schema(schema, sample)
            if validation["valid"]:
                samples.append(sample)
        if not samples:
            raise ValueError("No valid samples generated for self-consistency voting")
        majority_vote = samples[0]
        agreement_score = self._calculate_agreement_score(samples, majority_vote)
        return {
            "majorityVote": majority_vote,
            "agreementScore": agreement_score,
            "samples": samples,
            "confidence": agreement_score * (len(samples) / self.config["k"]),
        }

    async def _mock_llm_call(self, prompt: str, temperature: float, schema: SchemaType) -> Any:
        if schema == "plan":
            return {
                "intent": "plan",
                "goal": "Achieve objective",
                "steps": ["Step 1", "Step 2", "Step 3"],
                "timeline": "1 week",
                "resources_needed": ["Resource A", "Resource B"],
            }
        return {"mock": True}

    def _calculate_agreement_score(self, samples: List[Any], majority_vote: Any) -> float:
        agreements = 0
        for sample in samples:
            if self._samples_agree(sample, majority_vote):
                agreements += 1
        return agreements / len(samples)

    def _samples_agree(self, a: Any, b: Any) -> bool:
        return a == b


self_consistency_voter = SelfConsistencyVoter()
