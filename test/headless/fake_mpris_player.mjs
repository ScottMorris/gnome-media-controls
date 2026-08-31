#!/usr/bin/env node
// Minimal fake MPRIS player for headless extension smoke testing.
//
// Claims org.mpris.MediaPlayer2.TestPlayer on the session bus and exposes just
// enough of org.mpris.MediaPlayer2 / .Player for PlayerProxy.js to discover it,
// read its properties, and render a panel widget from them.
import dbus from "dbus-next";

const { Variant } = dbus;
const { Interface, ACCESS_READ } = dbus.interface;

const BUS_NAME = "org.mpris.MediaPlayer2.TestPlayer";
const OBJ_PATH = "/org/mpris/MediaPlayer2";

class MediaPlayer2Interface extends Interface {
  constructor() {
    super("org.mpris.MediaPlayer2");
  }

  get CanQuit() {
    return false;
  }
  get CanRaise() {
    return false;
  }
  get HasTrackList() {
    return false;
  }
  get Identity() {
    return "Test Player";
  }
  get DesktopEntry() {
    return "";
  }
  get SupportedUriSchemes() {
    return [];
  }
  get SupportedMimeTypes() {
    return [];
  }

  Raise() {}
  Quit() {}
}
MediaPlayer2Interface.configureMembers({
  properties: {
    CanQuit: { signature: "b", access: ACCESS_READ },
    CanRaise: { signature: "b", access: ACCESS_READ },
    HasTrackList: { signature: "b", access: ACCESS_READ },
    Identity: { signature: "s", access: ACCESS_READ },
    DesktopEntry: { signature: "s", access: ACCESS_READ },
    SupportedUriSchemes: { signature: "as", access: ACCESS_READ },
    SupportedMimeTypes: { signature: "as", access: ACCESS_READ },
  },
  methods: {
    Raise: {},
    Quit: {},
  },
});

function buildMetadata() {
  return {
    "mpris:trackid": new Variant("o", "/org/mpris/MediaPlayer2/TestPlayer/track1"),
    "xesam:title": new Variant("s", "Test Track"),
    "xesam:artist": new Variant("as", ["Test Artist"]),
  };
}

class PlayerInterface extends Interface {
  constructor() {
    super("org.mpris.MediaPlayer2.Player");
    this._metadata = buildMetadata();
  }

  get PlaybackStatus() {
    return "Playing";
  }
  get LoopStatus() {
    return "None";
  }
  get Rate() {
    return 1.0;
  }
  get Shuffle() {
    return false;
  }
  get Metadata() {
    return this._metadata;
  }
  get Volume() {
    return 1.0;
  }
  get Position() {
    return 0n;
  }
  get MinimumRate() {
    return 1.0;
  }
  get MaximumRate() {
    return 1.0;
  }
  get CanGoNext() {
    return true;
  }
  get CanGoPrevious() {
    return true;
  }
  get CanPlay() {
    return true;
  }
  get CanPause() {
    return true;
  }
  get CanSeek() {
    return true;
  }
  get CanControl() {
    return true;
  }

  // Player transport methods: no-ops, just need to exist for CanControl etc.
  Play() {}
  Pause() {}
  PlayPause() {}
  Stop() {}
  Next() {}
  Previous() {}
  Seek(_offset) {}
  SetPosition(_trackId, _position) {}
}
PlayerInterface.configureMembers({
  properties: {
    PlaybackStatus: { signature: "s", access: ACCESS_READ },
    LoopStatus: { signature: "s", access: ACCESS_READ },
    Rate: { signature: "d", access: ACCESS_READ },
    Shuffle: { signature: "b", access: ACCESS_READ },
    Metadata: { signature: "a{sv}", access: ACCESS_READ },
    Volume: { signature: "d", access: ACCESS_READ },
    Position: { signature: "x", access: ACCESS_READ },
    MinimumRate: { signature: "d", access: ACCESS_READ },
    MaximumRate: { signature: "d", access: ACCESS_READ },
    CanGoNext: { signature: "b", access: ACCESS_READ },
    CanGoPrevious: { signature: "b", access: ACCESS_READ },
    CanPlay: { signature: "b", access: ACCESS_READ },
    CanPause: { signature: "b", access: ACCESS_READ },
    CanSeek: { signature: "b", access: ACCESS_READ },
    CanControl: { signature: "b", access: ACCESS_READ },
  },
  methods: {
    Play: {},
    Pause: {},
    PlayPause: {},
    Stop: {},
    Next: {},
    Previous: {},
    Seek: { inSignature: "x" },
    SetPosition: { inSignature: "ox" },
  },
});

async function main() {
  const bus = dbus.sessionBus();
  const mprisIface = new MediaPlayer2Interface();
  const playerIface = new PlayerInterface();
  bus.export(OBJ_PATH, mprisIface);
  bus.export(OBJ_PATH, playerIface);
  await bus.requestName(BUS_NAME);

  console.log(`Fake MPRIS player running as ${BUS_NAME}`);

  // PlayerProxy's active-player selection is driven off property-change SIGNALS,
  // not the initial property fetch, and the extension's D-Bus signal listener for
  // this player isn't guaranteed to be registered yet right after this process
  // starts (extension/shell startup timing varies). Repeat periodically so
  // whichever announce lands after the listener exists is what actually triggers
  // discovery, rather than racing a single early one-shot announce.
  setInterval(() => {
    Interface.emitPropertiesChanged(playerIface, { Metadata: playerIface.Metadata }, []);
  }, 1000);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
