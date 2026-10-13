import { describe, expect, it } from "vitest";

import { serverAddress, serverEntryString } from "./server-utils";

// Both helpers carry the address format the game and the connect flow expect:
// dropping the port connects to the game's default port and stores a second,
// portless server entry (issue #248), so the port joins are pinned down here.
describe("serverAddress", () => {
  it("appends the port when one is stored", () => {
    expect(serverAddress({ ip: "88.211.219.57", port: 27395 })).toBe("88.211.219.57:27395");
  });

  it("keeps the bare host when no port is stored", () => {
    expect(serverAddress({ ip: "play.example.com", port: null })).toBe("play.example.com");
  });
});

describe("serverEntryString", () => {
  it("formats the clientsettings.json entry with port and password", () => {
    expect(
      serverEntryString({
        name: "RKN Immersive MP",
        ip: "88.211.219.57",
        port: 27395,
        password: "hunter2",
      }),
    ).toBe("RKN Immersive MP,88.211.219.57:27395,hunter2");
  });

  it("omits the port but keeps the empty password slot", () => {
    expect(
      serverEntryString({
        name: "RKN Immersive MP",
        ip: "88.211.219.57",
        port: null,
        password: "",
      }),
    ).toBe("RKN Immersive MP,88.211.219.57,");
  });
});
