#!/bin/bash
# Android Development Environment Setup for Aventura
# Run this script to set up environment variables for Android development

# Detect Android SDK location
if [ -d "$HOME/Android/Sdk" ]; then
    export ANDROID_HOME="$HOME/Android/Sdk"
elif [ -d "$HOME/android-sdk" ]; then
    export ANDROID_HOME="$HOME/android-sdk"
else
    echo "Error: Android SDK not found. Please install Android Studio first."
    exit 1
fi

# Find the latest NDK version
if [ -d "$ANDROID_HOME/ndk" ]; then
    NDK_VERSION=$(ls -1 "$ANDROID_HOME/ndk" | sort -V | tail -n 1)
    if [ -n "$NDK_VERSION" ]; then
        export NDK_HOME="$ANDROID_HOME/ndk/$NDK_VERSION"
    fi
fi

# Export paths
export PATH="$ANDROID_HOME/platform-tools:$PATH"
export PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"
export PATH="$ANDROID_HOME/emulator:$PATH"

# Print status
echo "=== Android Development Environment ==="
echo "ANDROID_HOME: $ANDROID_HOME"
echo "NDK_HOME: ${NDK_HOME:-NOT FOUND - Install via Android Studio SDK Manager}"
echo ""
echo "SDK Components:"
echo "- Platforms: $(ls $ANDROID_HOME/platforms/ 2>/dev/null | tr '\n' ' ')"
echo "- Build-tools: $(ls $ANDROID_HOME/build-tools/ 2>/dev/null | tr '\n' ' ')"
echo "- NDK: $(ls $ANDROID_HOME/ndk/ 2>/dev/null | tr '\n' ' ' || echo 'NOT INSTALLED')"
echo ""

# Check if NDK is missing
if [ -z "$NDK_HOME" ]; then
    echo "⚠️  NDK is required for Tauri Android builds!"
    echo ""
    echo "To install NDK:"
    echo "1. Open Android Studio"
    echo "2. Go to Settings > Languages & Frameworks > Android SDK"
    echo "3. Click 'SDK Tools' tab"
    echo "4. Check 'NDK (Side by side)'"
    echo "5. Click Apply"
    echo ""
fi

# Create a sourceable env file
cat > "$HOME/.android-env" << EOF
export ANDROID_HOME="$ANDROID_HOME"
export NDK_HOME="${NDK_HOME:-}"
export PATH="\$ANDROID_HOME/platform-tools:\$PATH"
export PATH="\$ANDROID_HOME/cmdline-tools/latest/bin:\$PATH"
export PATH="\$ANDROID_HOME/emulator:\$PATH"
EOF

echo "Environment saved to ~/.android-env"
echo "Add 'source ~/.android-env' to your shell profile (.bashrc, .zshrc)"
echo ""
echo "To initialize Tauri Android after installing NDK:"
echo "  source ~/.android-env"
echo "  npm run tauri android init"
