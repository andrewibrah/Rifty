from typing import Any, Dict, Tuple

DEFAULT_PRINCIPLE = "Optimize for reconnection (clarity, continuity, coherence); avoid verbose comfort."


class PrincipleAnchorMiddleware:
    def __init__(self, enabled: bool = True, principle: str = DEFAULT_PRINCIPLE) -> None:
        self.config = {"enabled": enabled, "principle": principle}
        self._log: list[Dict[str, Any]] = []

    def inject_principle(self, system_prompt: str) -> str:
        if not self.config["enabled"]:
            return system_prompt
        return f"{system_prompt}\n\nNorth-Star Principle: {self.config['principle']}"

    def nudge_response(self, response: Any, context: Any) -> Dict[str, Any]:
        if not self.config["enabled"]:
            return {"nudged": response, "wasNudged": False}
        response_text = response if isinstance(response, str) else str(response)
        verbose_patterns = ["comfort", "it's okay", "don't worry", "take it easy", "relax"]
        has_verbose = any(pattern.lower() in response_text.lower() for pattern in verbose_patterns)
        reconnection_patterns = ["let's continue", "building on", "next step", "moving forward", "connect"]
        has_reconnection = any(pattern.lower() in response_text.lower() for pattern in reconnection_patterns)
        if has_verbose and not has_reconnection:
            nudge_reason = "Detected verbose comfort without reconnection focus"
            self._log.append({"timestamp": "", "action": "nudged", "reason": nudge_reason, "originalResponse": response})
            nudged_response = self._add_reconnection_element(response)
            return {"nudged": nudged_response, "wasNudged": True, "reason": nudge_reason}
        return {"nudged": response, "wasNudged": False}

    def _add_reconnection_element(self, response: Any) -> Any:
        if isinstance(response, str):
            return response + "\n\nLet's continue building on this foundation."
        return response

    def get_logs(self) -> list[Dict[str, Any]]:
        return list(self._log)

    def set_enabled(self, enabled: bool) -> None:
        self.config["enabled"] = enabled

    def get_config(self) -> Dict[str, Any]:
        return dict(self.config)


principle_anchor = PrincipleAnchorMiddleware()
