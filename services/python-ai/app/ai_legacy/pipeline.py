from typing import Any, Dict, List

from pydantic import BaseModel


class UnderstandInput(BaseModel):
    userMessage: str
    context: Dict[str, Any]


class UnderstandOutput(BaseModel):
    intent: str
    entities: Dict[str, Any]
    complexity: float
    ambiguity: float
    requiredActions: List[str]


class ReasonInput(BaseModel):
    understandOutput: UnderstandOutput
    context: Dict[str, Any]


class ReasonOutput(BaseModel):
    plan: Dict[str, Any]
    confidence: float


class ActInput(BaseModel):
    reasonOutput: ReasonOutput
    understandOutput: UnderstandOutput
    context: Dict[str, Any]


class ActOutput(BaseModel):
    response: str
    actions: List[Dict[str, Any]]
    version: str
    diagnostics: Dict[str, Any] | None = None


def complexity_score(input_payload: Dict[str, Any]) -> float:
    user_message = input_payload.get("userMessage", "")
    tokens = len(user_message.split())
    ambiguity = len([m for m in ["?", "or", "maybe", "perhaps", "might", "could", "possibly"] if m in user_message.lower()])
    required_actions = len([m for m in ["create", "schedule", "plan", "analyze", "reflect"] if m in user_message.lower()])
    return (tokens / 100) + (ambiguity * 0.5) + required_actions


async def understand(input_payload: Dict[str, Any]) -> Dict[str, Any]:
    complexity = complexity_score({"userMessage": input_payload.get("userMessage", "")})
    ambiguity = min(complexity * 0.2, 1)
    intent = "reflection"
    entities: Dict[str, Any] = {}
    required_actions = ["analyze", "respond"]
    output = UnderstandOutput(intent=intent, entities=entities, complexity=complexity, ambiguity=ambiguity, requiredActions=required_actions)
    return output.model_dump()


async def reason(input_payload: Dict[str, Any]) -> Dict[str, Any]:
    plan = {
        "steps": ["Analyze user intent", "Generate response", "Check coherence"],
        "reasoning": "Based on understanding phase, create a structured plan",
    }
    output = ReasonOutput(plan=plan, confidence=0.8)
    return output.model_dump()


async def act(input_payload: Dict[str, Any]) -> Dict[str, Any]:
    response = "This is a placeholder response from the cognition engine."
    actions: List[Dict[str, Any]] = []
    output = ActOutput(response=response, actions=actions, version="cognition.v1")
    return output.model_dump()


async def run_pipeline(input_payload: Dict[str, Any]) -> Dict[str, Any]:
    validated = UnderstandInput(**input_payload)
    understand_result = await understand(validated.model_dump())
    reason_input = ReasonInput(understandOutput=UnderstandOutput(**understand_result), context=validated.context)
    reason_result = await reason(reason_input.model_dump())
    act_input = ActInput(reasonOutput=ReasonOutput(**reason_result), understandOutput=UnderstandOutput(**understand_result), context=validated.context)
    act_result = await act(act_input.model_dump())
    return act_result

