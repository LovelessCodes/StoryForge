{
  description = "Story Forge - a modern desktop launcher and mod manager for Vintage Story";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

    # Pinned to PR #110 (accept bun.lock format v2/v3) until it reaches a release.
    # https://github.com/nix-community/bun2nix/pull/110
    bun2nix.url = "github:nix-community/bun2nix/0456acb1b7394fc14c414b056aa889df5124943a";
    bun2nix.inputs.nixpkgs.follows = "nixpkgs";
  };

  nixConfig = {
    extra-substituters = [ "https://nix-community.cachix.org" ];
    extra-trusted-public-keys = [
      "nix-community.cachix.org-1:mB9FSh9qf2dCimDSUo8Zy7bkq5CX+/rkCWyvRCYg3Fs="
    ];
  };

  outputs =
    {
      self,
      nixpkgs,
      bun2nix,
    }:
    let
      systems = [
        "x86_64-linux"
        "aarch64-linux"
        # x86_64-darwin was dropped from nixpkgs unstable (26.11); Intel Mac
        # users on NixOS can pin nixpkgs-26.05 or use the regular release DMG.
        "aarch64-darwin"
      ];
      pkgsFor =
        system:
        import nixpkgs {
          inherit system;
          overlays = [ bun2nix.overlays.default ];
        };
      forAllSystems = f: nixpkgs.lib.genAttrs systems (system: f (pkgsFor system));
    in
    {
      packages = forAllSystems (pkgs: rec {
        default = pkgs.callPackage ./nix/package.nix { };
        storyforge = default;
      });

      devShells = forAllSystems (pkgs: {
        default = pkgs.mkShell {
          inputsFrom = [ self.packages.${pkgs.stdenv.hostPlatform.system}.default ];
          packages = [
            pkgs.bun
            pkgs.bun2nix
            pkgs.cargo-tauri
          ];
        };
      });

      formatter = forAllSystems (pkgs: pkgs.nixfmt-rfc-style);
    };
}
