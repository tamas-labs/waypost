# Developer shortcuts for the Waypost app. Run `make` (or `make help`) for the list.
#
# Variables (on the command line, e.g. `make apk API_URL=https://example.com/api/waypost/v1`):
#   API_URL  EXPO_PUBLIC_WAYPOST_API_URL baked into the JS bundle (needed for release builds: no /dev/server there)
#   DEVICE   device name for `expo run:android` (default: the only connected one, or a prompt)
#   IP       host:port of the phone for `make pair` / `make connect` (wireless debugging)
# adb honours ANDROID_SERIAL if more than one phone is connected.

PACKAGE     := com.tamaslabs.waypost
ADB         := $(if $(ANDROID_HOME),$(ANDROID_HOME)/platform-tools/adb,adb)
APK_RELEASE := android/app/build/outputs/apk/release/app-release.apk
APK_DEBUG   := android/app/build/outputs/apk/debug/app-debug.apk
API_ENV     := $(if $(API_URL),EXPO_PUBLIC_WAYPOST_API_URL=$(API_URL))
DEVICE_ARG  := $(if $(DEVICE),--device "$(DEVICE)")

.DEFAULT_GOAL := help

.PHONY: help
help: ## List the targets
	@awk 'BEGIN { FS = ":.*## " } /^[a-zA-Z0-9_-]+:.*## / { printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2 } /^## / { printf "\n%s\n", substr($$0, 4) }' $(MAKEFILE_LIST)

## Development

.PHONY: install start start-clear
install: ## npm install
	npm install

start: ## Metro dev server for the development build
	npm start

start-clear: ## Metro with a cleared cache (e.g. after a new migration)
	npm start -- --clear

## Checks

.PHONY: typecheck lint format format-check test test-watch coverage check e2e doctor db-generate
typecheck: ## tsc --noEmit
	npm run typecheck

lint: ## expo lint
	npm run lint

format: ## Prettier: format the files
	npm run format

format-check: ## Prettier: only check the format
	npm run format:check

test: ## Jest
	npm test

test-watch: ## Jest in watch mode
	npm test -- --watch

coverage: ## Jest with coverage of src/domain, src/chain and src/sync (M3-39)
	npm test -- --coverage --collectCoverageFrom='src/{domain,chain,sync}/**/*.ts' --coverageDirectory="$${TMPDIR:-/tmp}/waypost-coverage"

check: typecheck lint format-check test ## typecheck + lint + format + test (what closing a task needs)

E2E_URL ?= http://localhost:8088/api/waypost/v1
E2E_EMAIL ?= supervisor@waypost.test
E2E_PASSWORD ?= password
e2e: ## M5 acceptance against a running backend: make e2e E2E_URL=… (leaves a new site there)
	WAYPOST_E2E_URL=$(E2E_URL) WAYPOST_E2E_EMAIL=$(E2E_EMAIL) WAYPOST_E2E_PASSWORD=$(E2E_PASSWORD) npx jest __tests__/e2e

doctor: ## expo-doctor: dependencies and configuration
	npx expo-doctor

db-generate: ## New migration after a change of src/db/schema.ts
	npm run db:generate

## Android build (local, without EAS)

# android/ is generated (CNG): it is regenerated whenever the configuration is newer than it.
android/app/build.gradle: app.json app.config.ts package.json
	npx expo prebuild --platform android
	@touch $@

.PHONY: prebuild run-android run-release rebuild apk apk-debug
prebuild: ## Regenerate android/ from app.json and the config plugins
	npx expo prebuild --platform android

run-android: android/app/build.gradle ## Development build: compile, install on the phone, start Metro
	$(API_ENV) npx expo run:android $(DEVICE_ARG)

run-release: android/app/build.gradle ## Release build (JS bundled, no Metro): compile and install on the phone
	$(API_ENV) npx expo run:android --variant release --no-bundler $(DEVICE_ARG)

rebuild: prebuild ## After a native change: fresh android/, no build cache, install, start Metro
	$(API_ENV) npx expo run:android --no-build-cache $(DEVICE_ARG)

apk: android/app/build.gradle ## Release APK file (not store-signed) without installing it
	cd android && $(API_ENV) ./gradlew assembleRelease
	@echo "APK: $(APK_RELEASE)"

apk-debug: android/app/build.gradle ## Debug APK file (development build, needs Metro)
	cd android && ./gradlew assembleDebug
	@echo "APK: $(APK_DEBUG)"

# Standalone APK: JS bundled, no Metro, no Expo account; copy it to the phone and install it. The API URL is baked in
# (API_URL or EXPO_PUBLIC_WAYPOST_API_URL in .env.local), so prebuild runs every time (http:// needs cleartext traffic,
# app.config.ts) and the JS bundle is always rebuilt (Gradle does not see an environment change). ABIS: the CPU
# architectures (default: arm64-v8a, every phone of recent years; ABIS=arm64-v8a,x86_64 for the emulator too).
ABIS           ?= arm64-v8a
STANDALONE_APK  = dist/waypost-$(shell node -p "require('./app.json').expo.version")-$(shell git rev-parse --short HEAD)$(shell git diff --quiet HEAD || echo -dirty).apk
.PHONY: standalone install-standalone
standalone: ## Standalone release APK into dist/ (no Metro): make standalone API_URL=http://192.168.1.10:8088/api/waypost/v1
	@test -n "$(API_URL)" || grep -qs '^EXPO_PUBLIC_WAYPOST_API_URL=.' .env.local || \
	  { echo "The API URL is missing: make standalone API_URL=<url>, or EXPO_PUBLIC_WAYPOST_API_URL in .env.local"; exit 1; }
	$(API_ENV) npx expo prebuild --platform android
	cd android && $(API_ENV) ./gradlew createBundleReleaseJsAndAssets --rerun assembleRelease -PreactNativeArchitectures=$(ABIS)
	@mkdir -p dist && cp $(APK_RELEASE) $(STANDALONE_APK)
	@echo "APK: $(STANDALONE_APK)"

install-standalone: ## Install the newest APK built by `make standalone` on the connected phone
	$(ADB) install -r "$$(ls -t dist/waypost-*.apk | head -1)"

## Phone (adb)

.PHONY: devices pair connect reverse install-apk install-apk-debug uninstall launch logcat
devices: ## Connected phones
	$(ADB) devices -l

pair: ## Wireless debugging pairing: make pair IP=192.168.1.20:37123 (asks for the code)
	@test -n "$(IP)" || { echo "Usage: make pair IP=<host:port>"; exit 1; }
	$(ADB) pair $(IP)

connect: ## Wireless debugging connection: make connect IP=192.168.1.20:41234
	@test -n "$(IP)" || { echo "Usage: make connect IP=<host:port>"; exit 1; }
	$(ADB) connect $(IP)

reverse: ## Let the phone reach Metro on this machine (port 8081)
	$(ADB) reverse tcp:8081 tcp:8081

install-apk: ## Install the release APK built by `make apk`
	$(ADB) install -r $(APK_RELEASE)

install-apk-debug: ## Install the debug APK built by `make apk-debug`
	$(ADB) install -r $(APK_DEBUG)

uninstall: ## Remove the app from the phone (deletes its database, tokens and chain!)
	$(ADB) uninstall $(PACKAGE)

launch: ## Start the installed app
	$(ADB) shell monkey -p $(PACKAGE) -c android.intent.category.LAUNCHER 1 >/dev/null

logcat: ## Log of the running app only
	@pid=$$($(ADB) shell pidof -s $(PACKAGE)); \
	test -n "$$pid" || { echo "$(PACKAGE) is not running"; exit 1; }; \
	$(ADB) logcat --pid=$$pid

## Cleanup and cloud

.PHONY: clean-native eas-dev
clean-native: ## Delete the generated native folders and module build outputs
	rm -rf android ios modules/*/android/build

eas-dev: ## Development build on EAS (needs an Expo account)
	npx eas-cli@latest build --profile development --platform android
