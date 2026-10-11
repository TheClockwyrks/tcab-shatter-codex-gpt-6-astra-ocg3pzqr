# Shatter — Controls

Shatter is flown from the keyboard, and its menus take a mouse and touch as well.
This file defines every action the game answers to and the keys bound to it. What
the ship does when it turns, thrusts, and fires is in `specs/ship.md` and
`specs/weapons.md`, and the screens the menu actions move between are in
`specs/ui.md`.

## How input reaches the game

Input reaches the game as named actions from the Simple 2D engine, which
documents them in the `engine/` directory at the root of this repository. The game
registers the layout `LAYOUT` (`dpad-4-two-buttons`), which carries four-way
movement and two buttons, and registers every action in `ACTIONS` against the keys
`BINDINGS` gives it. `BINDINGS` names each key by its `KeyboardEvent.code`, so a
binding is a physical key rather than a layout-dependent character.

The whole of `ACTIONS` is registered.

## The actions

| Action | While playing | On a menu |
| --- | --- | --- |
| `up` | Thrust | Move the selection up |
| `down` | — | Move the selection down |
| `left` | Rotate counter-clockwise | — |
| `right` | Rotate clockwise | — |
| `a` | Fire the gun | — |
| `b` | Launch the torpedo | — |
| `confirm` | — | Confirm the selection |
| `back` | — | Leave the screen |
| `pause` | Pause | Resume the paused game |
| `mute` | Toggle sound | Toggle sound |

## The bindings

| Action | Keys |
| --- | --- |
| `up` | `ArrowUp`, `KeyW` |
| `down` | `ArrowDown`, `KeyS` |
| `left` | `ArrowLeft`, `KeyA` |
| `right` | `ArrowRight`, `KeyD` |
| `a` | `Space` |
| `b` | `KeyF` |
| `confirm` | `Enter`, `Space` |
| `back` | `Escape` |
| `pause` | `KeyP`, `Escape` |
| `mute` | `KeyM` |

`back` is read on `title`, `howto`, `paused`, and `gameover`, and `pause` is read
on `playing` and `paused`. `Escape` raises both on one frame, so a single `Escape`
press on `playing` pauses once and a single `Escape` press on `paused` resumes
once. On `paused`, `pause` and `back` are read before the menu edges, and a frame
carrying either resumes and does nothing else. `Space` drives firing while the game
is being played and confirms on a screen showing a menu.

## Holds and presses

Rotation and thrust are read as holds: the ship turns and accelerates for as long
as the key is down and stops the moment it is released.

Firing is read as a press and as a hold. One press takes one shot; holding the key
takes a shot at the gun's own gate, as `specs/weapons.md` states.
The torpedo is read as a press alone: one launch per press, with no repeat while
the key is held.

Confirming, leaving a screen, pausing, and muting are read as press edges, once
per press.

## Menus

Every menu is vertical. The up and down inputs move the highlight by one entry and
wrap at both ends, so moving down from the last entry highlights the first and
moving up from the first highlights the last. The highlight is therefore always on
one of the menu's own entries. Confirming takes the highlighted entry, and
`specs/ui.md` states each screen's entries and where each leads.

A mouse and a touch contact drive the menus too, directly rather than through a
registered action, so no action of the table above is raised by either.
`specs/ui.md` states what a move, a press, a release, a landing and a lift each do,
and `specs/instrumentation.md` states the reading through which the build reports
an entry's hit region.

## The debug overlay

The read-only debug overlay is the engine's, shown and hidden by the backtick key,
`KeyboardEvent.code` `Backquote`, and off when the game starts. It is not one of
Shatter's actions. What it shows is in `specs/instrumentation.md`.
