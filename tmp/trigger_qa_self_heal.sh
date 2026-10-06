#!/bin/bash

# Trigger QA Self-Heal workflow for QA Failure Radar
gh workflow run qa-self-heal.yml --repo quantdeus/quantdeus.github.io --ref main --input lane=actions --input trigger_run_id=37422184471 --input trigger_workflow=qa-failure-radar.yml