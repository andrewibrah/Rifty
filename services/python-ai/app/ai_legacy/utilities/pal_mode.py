from typing import Any, Dict, Optional


class PALMode:
    def __init__(self, enabled: bool = True, timeout: int = 5000, max_code_length: int = 1000) -> None:
        self.config = {"enabled": enabled, "timeout": timeout, "maxCodeLength": max_code_length}

    async def should_use_pal(self, input_payload: Dict[str, Any]) -> bool:
        if not self.config["enabled"]:
            return False
        return self._detect_numeric_reasoning(input_payload.get("userMessage", ""))

    async def execute_pal(self, input_payload: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        if not await self.should_use_pal(input_payload):
            return None
        try:
            code = await self._generate_python_code(input_payload.get("userMessage", ""))
            if len(code) > self.config["maxCodeLength"]:
                raise ValueError("Generated code too long")
            result = await self._run_python_sandbox(code, self.config["timeout"])
            return {"computed": result, "code": code, "success": True}
        except Exception as error:  # pylint: disable=broad-except
            return {"computed": None, "code": "", "success": False, "error": str(error)}

    async def _generate_python_code(self, user_message: str) -> str:
        if "sum" in user_message or "+" in user_message:
            return "numbers = [1,2,3,4,5]\nresult = sum(numbers)\nreturn result"
        if "calculate" in user_message:
            return "result = 2 + 2\nreturn result"
        return "# Default mock calculation\nresult = 42\nreturn result"

    async def _run_python_sandbox(self, code: str, timeout: int) -> Any:
        if "return" in code:
            return 42
        if "print(" in code:
            return "simulated output"
        raise RuntimeError("Mock sandbox execution failed")

    def _detect_numeric_reasoning(self, text: str) -> bool:
        patterns = ["+", "calculate", "compute", "sum", "average", "total", "math", "equation"]
        lower = text.lower()
        return any(pattern in lower for pattern in patterns)


pal_mode = PALMode()
