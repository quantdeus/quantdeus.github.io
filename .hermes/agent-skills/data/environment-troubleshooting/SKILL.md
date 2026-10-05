---
name: environment-troubleshooting
description: Diagnose constrained software environments by identifying platform, permissions, missing dependencies, resource limits, and the least-invasive workaround.
---
# Environment Troubleshooting

Use when a tool, package, runtime, or automation works in one environment but fails in another.

## Procedure

1. Record the actual platform/runtime/version and the exact failing command or error.
2. Separate missing dependency, permission, sandbox, filesystem, network, architecture, and resource failures.
3. Prefer supported package/runtime paths before hacks.
4. Test the smallest harmless diagnostic first.
5. Avoid root/admin escalation unless it is genuinely required and explicitly authorized.
6. Offer a compatible fallback when the platform cannot support the requested stack.
7. Verify success with a concrete command/output, not an assumption.

## Legacy Boundary

Do not assume the old Xiaomi/Android/Termux paths or device state from PicoClaw. They are historical examples only.
