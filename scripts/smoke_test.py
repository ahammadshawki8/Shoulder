"""Tier 0 smoke test: confirm Strands can reach Bedrock and run an agent."""

import sys

from strands import Agent
from strands.models import BedrockModel

MODEL_ID = "us.anthropic.claude-sonnet-4-5-20250929-v1:0"
REGION = "us-east-1"


def main() -> int:
    print(f"strands: importing ok")
    model = BedrockModel(model_id=MODEL_ID, region_name=REGION)
    agent = Agent(
        model=model,
        system_prompt="You are a test harness. Answer in exactly one short sentence.",
        callback_handler=None,
    )
    result = agent("Reply with the single word: ready")
    text = str(result).strip()
    print(f"model:   {MODEL_ID}")
    print(f"region:  {REGION}")
    print(f"reply:   {text}")
    if not text:
        print("FAIL: empty response")
        return 1
    print("PASS: Bedrock reachable through Strands")
    return 0


if __name__ == "__main__":
    sys.exit(main())
