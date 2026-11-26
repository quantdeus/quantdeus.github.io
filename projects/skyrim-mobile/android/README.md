# Android shell — Gate 3 backlog (NOT YET AN APK)

Intended Kotlin WebViewAssetLoader / app-internal files:
1. Verify SHA-256 of downloaded immutable pack to staging; reject oversized, invalid path or origin.
2. Atomically promote verified pack manifest; keep prior release rollback.
3. Map app-private packs through fixed HTTPS-style asset origin, never broad file://; disable unsafe JavaScript bridges.
4. Keep browser runtime identical to Vite production output and request user consent before mobile data downloads.
5. Support offline mandatory packs, audio focus, lifecycle/background, scoped storage and Android back.
6. Generate signed debug/release builds in guarded GitHub Actions with keystore managed outside the repository.
7. Test on at least three physical Android/GPU combinations, collect 30/45/60-minute FPS/thermal metrics.

No Android Gradle toolchain or signed APK is claimed in Prototype 0.1.
