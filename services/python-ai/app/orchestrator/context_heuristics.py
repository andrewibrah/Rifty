from typing import Dict, List, Optional


MemoryNodeType = str


def infer_likely_need(input_text: str, dominant_mood: Optional[str], top_topic: Optional[str]) -> str:
    normalized = input_text.lower()
    if "schedule" in normalized or "calendar" in normalized:
        return "schedule_alignment"
    if "goal" in normalized or "progress" in normalized:
        return "goal_support"
    if any(token in normalized for token in ["tired", "fatigue", "exhausted", "burned out"]):
        return "energy_check"
    if "again" in normalized and dominant_mood == "stressed":
        return "stress_recovery"
    if dominant_mood == "tired":
        return "restoration_prompt"
    if top_topic in ("work", "project"):
        return "workload_review"
    if top_topic in ("family", "relationships"):
        return "relationship_context"
    return "context_refresh"


def aggregate_modes(entries: List[Dict[str, str]]) -> List[Dict[str, str]]:
    counts: Dict[str, Dict[str, any]] = {}
    for entry in entries:
        mood = (entry.get("mood") or "").strip().lower()
        if not mood:
            continue
        current = counts.get(mood)
        if current:
            current["count"] += 1
            if current["lastSeen"] < entry.get("created_at", ""):
                current["lastSeen"] = entry.get("created_at", "")
        else:
            counts[mood] = {"count": 1, "lastSeen": entry.get("created_at", "")}
    result = [
        {"label": label, "count": value["count"], "last_seen_at": value["lastSeen"]}
        for label, value in counts.items()
    ]
    return sorted(result, key=lambda item: (-item["count"], item["last_seen_at"]))[:6]


def build_evidence(matches: List[Dict[str, any]], edge_rows: List[Dict[str, any]], neighbor_nodes: Dict[str, Dict[str, any]], include_fatigue: List[Dict[str, any]], threshold: float = 0.4) -> List[Dict[str, any]]:
    evidence: Dict[str, Dict[str, any]] = {}

    def add_evidence(node: Dict[str, any], strength: float, source: str):
        if not node or strength < threshold:
            return
        existing = evidence.get(node["id"])
        if existing:
            if existing["strength"] < strength:
                existing["strength"] = strength
            existing["sources"].add(source)
        else:
            evidence[node["id"]] = {
                "id": node["id"],
                "type": node.get("type"),
                "text": node.get("text"),
                "strength": strength,
                "trust_weight": node.get("trust_weight", 0),
                "sentiment": node.get("sentiment"),
                "sources": {source},
            }

    for match in matches:
        node = {
            "id": match.get("node_id"),
            "type": match.get("node_type"),
            "text": match.get("text"),
            "trust_weight": match.get("trust_weight", 0),
            "sentiment": match.get("sentiment"),
        }
        add_evidence(node, match.get("score", 0) * match.get("trust_weight", 0), "vector_match")

    for edge in edge_rows:
        source = neighbor_nodes.get(edge.get("src_id"))
        target = neighbor_nodes.get(edge.get("dst_id"))
        if not source or not target:
            continue
        forward_strength = edge.get("weight", 0) * target.get("trust_weight", 0)
        add_evidence(target, forward_strength, f"edge:{edge.get('relation')}")
        reverse_strength = edge.get("weight", 0) * source.get("trust_weight", 0)
        add_evidence(source, reverse_strength, f"edge:{edge.get('relation')}")

    for node in include_fatigue:
        add_evidence(node, min(0.9, node.get("trust_weight", 0)), "fatigue_recall")

    formatted = []
    for item in evidence.values():
        formatted.append(
            {
                "id": item["id"],
                "type": item["type"],
                "text": item["text"],
                "strength": round(item["strength"], 3),
                "trust_weight": round(item["trust_weight"], 3),
                "sentiment": item["sentiment"],
                "sources": list(item["sources"])[:5],
            }
        )
    return sorted(formatted, key=lambda node: node["strength"], reverse=True)[:20]

