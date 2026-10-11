// Mayday from the Sable Wren: the first patrol encounter.
//
// An independent hauler says her drive is dead and asks for help. She isn't quite lying and
// she isn't telling the truth: the Wren is waiting to take on smuggled cargo, and the "dead"
// coupling is only worn. What the captain finds depends on how they come in; every ending
// trades one meter against another.
//
// The captain never speaks: the choices are their words. Lines without #speaker are narration.
// Tags and functions are explained in content/events/README.md.

-> mayday

=== mayday ===
Captain on the bridge! #speaker:quartermaster
Captain. Distress call, ten minutes ago: an independent hauler, the Sable Wren, out of Tamsin. #speaker:ashford
They report a dead drive coupling and a coolant leak. Three crew aboard. They're eleven thousand kilometres off our track, on the edge of the Belt. #speaker:ashford
Playing it now, Captain. #speaker:comms-rating
"Any Navy vessel, this is the Sable Wren. Our drive's dead and we're bleeding coolant. We need a coupling and forty litres of coolant, that's all. Please. There's a kid aboard." #speaker:varga
Regulations are clear, Captain: we render assistance to any vessel in distress. #speaker:okafor
They're just as clear that a patrol keeps to its schedule. Fort Marrow expects our first position report at 1800. #speaker:okafor
One more thing, Captain. The navigator's night log has their transponder at that same spot since 0300. #speaker:ashford
Five hours adrift, and they didn't call anyone until we came over the horizon. #speaker:ashford
A ship that waits for a warship before it cries for help is either very polite, or very sure who it wants to meet. #speaker:sethi

* [Best speed. We answer the call.]
    ~ fx("crew", 2)
    ~ fx("highCommand", -1)
    Helm, come about. Best speed for the Sable Wren. #speaker:ashford
    -> contact_open
* [Battle stations first. Active sensors, weapons warm. Then we answer.]
    ~ fx("rel.sethi", 3)
    ~ fx("fatigue", 4)
    ~ fx("readiness", 1)
    Battle stations, aye. Now we're talking. #speaker:sethi
    -> contact_armed
* [Go in quiet. Passive sensors only, and let's see who else is out there.]
    ~ fx("rel.okafor", 2)
    ~ fx("highCommand", -2)
    Rig for silent running. At this pace it'll take three hours, Captain. #speaker:okafor
    -> contact_quiet
* [Log it, pass it to Fort Marrow, and keep to our schedule.]
    ~ fx("highCommand", 3)
    ~ fx("crew", -4)
    ~ fx("rel.moreau", -5)
    -> ignored

=== contact_open ===
We're in range, Captain. The Wren is answering. #speaker:ashford
Navy! Thank the stars. Just float the coupling and the coolant over and we'll be out of your way. No need to come aboard. #speaker:varga
Bridge, engineering. I've been looking at their emissions, Captain. #speaker:holm
A failed coupling bleeds coolant hot; you'd see it from here. Their drive section is cold. Stone cold. #speaker:holm
Either they fixed it themselves, or it never broke. #speaker:holm

* [Send the parts over. They asked for help, not questions. #cost:budget:300]
    ~ fx("budget", -300)
    ~ fx("crew", 2)
    ~ fx("rel.moreau", 2)
    ~ fx("rel.okafor", -3)
    ~ flag("wren_helped")
    -> helped
* [We'll bring the parts ourselves: the cutter, with a marine escort.]
    ~ fx("rel.mensah", 2)
    A marine escort for a box of spares? They'll love that. #speaker:sethi
    -> boarding_party
* [Tell them to stand by for inspection.]
    ~ fx("rel.okafor", 3)
    ~ fx("highCommand", 1)
    Inspection? We're a hauler, Captain, not a gunrunner! …Fine. Fine. Come aboard. #speaker:varga
    -> boarding_party
* [Have the Chief Engineer talk their engineer through the repair. #req:rel.holm>=trusted]
    -> holm_asks

=== holm_asks ===
Wren, this is the {ship()}'s chief engineer. Talk me through it. Which flange let go? #speaker:holm
…The, er. The big one. #speaker:varga
There isn't a big one. Captain, there is nothing wrong with that drive that a spanner wouldn't fix. #speaker:holm
~ fx("rel.holm", 3)
~ flag("wren_lie_caught")
-> boarding_party

=== helped ===
The cutter floats the crates across. Twenty minutes later, the Wren's drive lights up.
Full burn, Captain, on a coupling we handed them twenty minutes ago. That drive was never dead. #speaker:holm
Second drive plume, bearing zero-four-zero! Something was sitting behind that rock, and it's leaving with her. #speaker:ashford
~ fx("highCommand", -1)
~ flag("wren_got_away")
We'll log it, Captain. Fort Marrow may want to know the Sable Wren's name. #speaker:okafor
-> END

=== contact_armed ===
The {ship()} closes at battle stations, active sensors sweeping every rock in range.
Easy, Navy! We're a hauler, not a pirate! Point those somewhere else! #speaker:varga
Contact! Bearing zero-four-zero, out from behind that rock. She's lit her drive. She's running! #speaker:sethi
Small, fast, no transponder. The Wren isn't going anywhere, Captain, but that one will be in the Belt in ten minutes. #speaker:sethi

* [After her!]
    ~ fx("rel.sethi", 5)
    ~ fx("fatigue", 6)
    ~ fx("highCommand", -2)
    -> chase
* [Let her go. Hold the Wren where she is and prepare to board.]
    ~ fx("rel.okafor", 2)
    -> boarding_party
* [Hail the runner.]
    Nothing, Captain. She isn't answering. …Gone into the rocks. #speaker:comms-rating
    -> boarding_party

=== chase ===
The {ship()} comes about at full burn. The runner is faster, and her pilot knows the Belt. Forty minutes later the plot shows nothing but rock.
Lost her, Captain. But I have her drive signature now. If she ever shows herself again, we'll know her. #speaker:sethi
~ flag("runner_signature")
And the Wren has had forty minutes on her own. #speaker:okafor
-> boarding_party

=== contact_quiet ===
Three hours of silent running. Then the passive array picks up two hulls, not one.
The Wren, Captain, and something else, sitting cold in the shadow of that rock. Small. No transponder. #speaker:sensor-supervisor
There's a tether between them. They're moving cargo across. #speaker:sensor-supervisor
They don't know we're here. #speaker:okafor

* [Light them up and hail them both. Now.]
    ~ fx("highCommand", 2)
    ~ fx("rel.sethi", 1)
    ~ flag("wren_caught")
    The runner cuts the tether and bolts for the rocks. The Wren, half her cargo still on the line, goes nowhere.
    -> boarding_party
* [Keep watching. I want to see what they're moving.]
    ~ fx("rel.okafor", 2)
    ~ flag("wren_caught")
    ~ flag("saw_the_crates")
    Long crates, Captain. Four… five. Going from the runner to the Wren. #speaker:sensor-supervisor
    When the {ship()} finally lights up, the runner cuts the tether and bolts. The Wren, caught with the crates in her hold, goes nowhere.
    -> boarding_party

=== ignored ===
Logged and passed to Fort Marrow, Captain. #speaker:ashford
An hour later, comms catches a tight beam from the Wren's position, meant for someone else. #speaker:comms-rating
"Navy's gone. Bring her in." #speaker:varga
~ flag("wren_ignored")
By the book, Captain. Nobody can fault us for that. #speaker:okafor
And nobody can say we helped. #speaker:sethi
-> END

=== boarding_party ===
~ summon("mensah", "hangar")
~ summon("strand", "hangar")
The boarding party is mustering in the hangar, Captain. Lieutenant {last("mensah")} is asking for you. #speaker:okafor #goto:hangar
-> hangar

=== hangar ===
Captain. Sergeant {last("strand")} leads, I go with them. Six marines, sidearms and vacuum suits. #speaker:mensah
Before we go: rules of engagement? #speaker:mensah

* [By the book. Weapons holstered unless they draw.]
    ~ fx("rel.mensah", 3)
    ~ fx("crew", 1)
    By the book. #speaker:strand
* [Weapons out. If anything moves wrong, put them on the deck.]
    ~ fx("rel.mensah", -2)
    ~ fx("rel.sethi", 2)
    ~ flag("wren_weapons_out")
    …Aye, Captain. #speaker:mensah
* [Take Doctor {last("moreau")} with you. If there really is a child aboard, I want them looked at.]
    ~ summon("moreau", "hangar")
    ~ fx("rel.moreau", 5)
    ~ fx("readiness", -1)
    ~ flag("moreau_boarded")
    I'm here. Give me two minutes to grab a kit. #speaker:moreau

- The cutter launches. The hangar goes quiet, and you wait by the airlock with the deck crew.
The radio crackles.
Captain, {last("strand")}. Three crew aboard, like they said. No resistance. #speaker:strand
Every crate in the hold says "mining equipment". They aren't. Power couplings, military grade, serial numbers ground off. Sixty crates. #speaker:strand
{ has("moreau_boarded"):
    There is a child, Captain. A boy, fifteen, with coolant burns on both hands. They weren't lying about the leak, only about everything else. I've treated him. #speaker:moreau
}
-> verdict

=== verdict ===
Their master wants a word with you, Captain. #speaker:strand
Captain. Ilse Varga. The Wren's mine, and so is the debt on her. #speaker:varga
Halvard pays independents to haul what Halvard can't be seen hauling. We sit where we're told and wait. That's the job, or you lose your ship to the bank. #speaker:varga
The coupling really is going. The boy got burned trying to fix it. #speaker:varga

- (decide)
* [Who were the crates for?]
    A man at Fort Marrow. Never gave a name. Paid in Halvard scrip. That's all I know, and it's more than's healthy. #speaker:varga
    ~ flag("wren_named_halvard")
    -> decide
+ [Seize the cargo, arrest the crew, and report it all to Fort Marrow.]
    ~ fx("highCommand", 8)
    ~ fx("rel.okafor", 5)
    ~ fx("crew", 2)
    ~ fx("rel.moreau", -3)
    ~ flag("wren_seized")
    -> seized
+ [Seize the cargo, fix their drive and let them go. #cost:budget:300]
    ~ fx("budget", -300)
    ~ fx("highCommand", 4)
    ~ fx("rel.moreau", 4)
    ~ fx("rel.okafor", -2)
    ~ flag("wren_seized")
    ~ flag("wren_let_go")
    -> let_go
+ [Fine them two thousand credits, and keep it off the record.]
    ~ fx("budget", 2000)
    ~ fx("rel.okafor", -8)
    ~ fx("rel.mensah", -3)
    ~ flag("wren_fined_quietly")
    -> fined
+ [Fix their drive and let them go. We never saw any crates. #cost:budget:300]
    ~ fx("budget", -300)
    ~ fx("rel.moreau", 5)
    ~ fx("crew", 1)
    ~ fx("rel.okafor", -10)
    ~ flag("wren_let_go")
    ~ flag("covered_for_the_wren")
    -> covered

=== seized ===
Sixty crates of military couplings are logged, sealed and stowed in the {ship()}'s hold. Fort Marrow acknowledges, and asks for the Wren to be brought in.
High Command will want to know where they came from, Captain. So will I. #speaker:okafor
{ has("moreau_boarded"):
    They'll take her ship, and the boy goes with his mother to a cell. I hope the couplings were worth it. #speaker:moreau
}
-> END

=== let_go ===
The crates go into the {ship()}'s hold. The Wren gets a new coupling and her life back, minus a cargo she never owned.
Varga doesn't thank you. But at the cutter's hatch, she looks back once.
Fort Marrow will ask why we let a smuggler go, Captain. I'd like to have an answer ready. #speaker:okafor
-> END

=== fined ===
Two thousand credits change hands, and the log says "routine inspection, minor irregularities". The cargo stays where it is.
Understood, Captain. #speaker:okafor
My marines will remember what they carried back, Captain. And what they didn't. #speaker:mensah
-> END

=== covered ===
The Wren's coupling is replaced at the Navy's expense, and her cargo goes on its way with her. The log says "assistance rendered".
Thank you, Captain. You didn't have to. #speaker:varga
No. We didn't. #speaker:okafor
-> END
