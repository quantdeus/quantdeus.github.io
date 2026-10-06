#!/bin/bash

# Trigger the QA Self-Heal workflow with the failure details

# Trigger Run ID from the failed QA Failure Radar
TRIGGER_RUN_ID=37399805462

# Trigger Workflow Name from the failed QA Failure Radar
TRIGGER_WORKFLOW="QuantDeus QA Failure Radar 📡"

# Dispatch the QA Self-Heal workflow
gh workflow run qa-self-heal.yml --repo "quantdeus/quantdeus.github.io" --ref main --input "lane=actions" --input "trigger_run_id=$TRIGGER_RUN_ID" --input "trigger_workflow=$TRIGGER_WORKFLOW"
