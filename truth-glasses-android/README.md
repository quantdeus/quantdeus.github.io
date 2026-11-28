# Очки правды · QuantDeus

Android MVP с тремя режимами: Умеренный реализм, Кар-Кар GPT и вымышленный Рептилоидный перевод.

## Build APK
Workflow: `.github/workflows/truth-glasses-apk.yml`. It builds on push to main or `codex/truth-glasses-apk` when app files change, and can be run manually from Actions. The APK is uploaded as artifact `truth-glasses-debug-apk`.

## OpenRouter key
The APK does not contain an API key. For live AI analysis, enter your own OpenRouter key in the app. It is held only in the current session and is not saved by the app. Without a key, demo mode is available. Never inject `OPENROUTER_API_KEY` from GitHub Secrets into a client APK because APK contents are inspectable.

Minimum Android: 7.0 (API 24). Site: https://quantdeus.github.io/.
