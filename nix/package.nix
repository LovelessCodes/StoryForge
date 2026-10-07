{
  lib,
  stdenv,
  rustPlatform,
  cargo-tauri,
  bun,
  bun2nix,
  pkg-config,
  perl,
  openssl,
  sqlite,
  wrapGAppsHook4,
  glib-networking,
  webkitgtk_4_1,
  libayatana-appindicator,
}:

rustPlatform.buildRustPackage (finalAttrs: {
  pname = "story-forge";
  version = (lib.importJSON ../package.json).version;

  src = lib.cleanSourceWith {
    src = ../.;
    filter =
      path: _type:
      !(lib.elem (baseNameOf path) [
        "node_modules"
        "dist"
        "target"
        ".direnv"
      ]);
  };

  cargoRoot = "src-tauri";
  buildAndTestSubdir = finalAttrs.cargoRoot;

  cargoLock.lockFile = ../src-tauri/Cargo.lock;

  nativeBuildInputs = [
    cargo-tauri.hook
    bun2nix.hook
    bun
    perl
    pkg-config
  ]
  ++ lib.optionals stdenv.hostPlatform.isLinux [ wrapGAppsHook4 ];

  buildInputs = [
    openssl
    sqlite
  ]
  ++ lib.optionals stdenv.hostPlatform.isLinux [
    glib-networking
    webkitgtk_4_1
    libayatana-appindicator
  ];

  bunDeps = bun2nix.fetchBunDeps {
    bunNix = ../bun.nix;
  };

  # The frontend is built by `tauri build` itself (beforeBuildCommand runs
  # `bun run build`), so the hook's default build/check/install phases are unused.
  dontUseBunBuild = true;
  dontUseBunCheck = true;
  dontUseBunInstall = true;

  # Match the linker strategy used in the release pipeline; bun's isolated
  # linker (the hook default) can break tools that expect a hoisted layout.
  bunInstallFlags = [ "--linker=hoisted" ] ++ lib.optionals stdenv.hostPlatform.isDarwin [ "--backend=copyfile" ];

  # Updater artifacts are signed in the GitHub release pipeline; there are no
  # signing keys in the sandbox.
  tauriBuildFlags = [ "--config" (builtins.toJSON { bundle.createUpdaterArtifacts = false; }) ];

  meta = {
    description = "A modern desktop launcher and mod manager for Vintage Story";
    homepage = "https://github.com/LovelessCodes/StoryForge";
    license = lib.licenses.gpl3Only;
    platforms = lib.platforms.linux ++ lib.platforms.darwin;
    mainProgram = "StoryForge";
  };
})
