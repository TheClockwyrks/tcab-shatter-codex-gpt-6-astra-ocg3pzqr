# Shatter — Audio

This file defines the game's sound: the six cues, when each plays, and the mute
toggle. The key that toggles muting is in `specs/controls.md`.

Audio plays through the engine's cue bus. Define and play exactly the six cues in
`CUES`, under exactly these names, one per event.

## The cues

| Cue | Constant | Played when |
| --- | --- | --- |
| `fire` | `CUES.fire` | The ship's gun takes a shot. |
| `shatter` | `CUES.shatter` | A rock is destroyed. |
| `thrust` | `CUES.thrust` | Thrust is being applied. |
| `saucer` | `CUES.saucer` | A saucer arrives on the field. |
| `death` | `CUES.death` | The ship is destroyed. |
| `extra-life` | `CUES.extraLife` | An extra ship is granted. |

Each is a distinct short sound, so the six events are told apart by ear. Each is
played on the tick its event happens and at most once on that tick; a tick that
raises more than one of them plays each of those once.

`thrust` is the exception: it is held. It starts on the tick thrust begins to be
applied, sounds for as long as thrust is applied, and stops within a tenth of a
second of thrust being released. A single blip at the start of a burn is not this
cue.

## Muting

Muting belongs to the engine. The game binds the mute action to the engine's mute
bit and toggles it from any screen. While sound is muted every cue is silent and
the game stays fully playable.

## Audio is never a dependency of play

The game runs, draws, and is fully playable before any audio has started.
