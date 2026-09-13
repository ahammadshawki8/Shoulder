# Shoulder: demo video script

**Target length:** 3 minutes 10 seconds (hard limit 3 minutes 30 seconds)
**Voice:** warm, unhurried, a storyteller who happens to be an engineer. About 145 words a minute.
**Music:** soft piano under the opening, lifting slightly at the solution, gentle at the close. Keep it under the voice.

---

## Before recording

- **Live app:** https://shoulder-100-56-157-153.sslip.io . Use a fresh browser profile, 1440 by 900, zoom 110 percent, light theme unless a scene says dark.
- **Two windows side by side** for scene 5: left logged in as Farah (`rahman` / `farah`), right as Amina (`rahman` / `amina`). Log in to each with its own profile or a private window.
- **The Rahmans reset every 12 hours.** If the decision cards are already answered, restart the app so both cards are back before recording:
  `ssh -i ~/.ssh/shoulder-deploy.pem ubuntu@100.56.157.153 'cd /opt/shoulder/deploy && sudo docker compose restart app'`
- **A live negotiation** takes about three minutes on Claude. Record it once in full as Farah (Tasks, "Negotiate now", then Control Panel, "Agent activity") and speed the middle up in the edit. A family can start one every ten minutes.
- **Terminal** with a large font for one short shot: `python -m evals --quick`.
- Record screens as silent clips first, then lay the voiceover over them. Cut on the sentence, not mid-word.

---

## Scene 1: The hook (0:00 to 0:22)

**On screen**
- Black screen. White text types slowly, one line at a time, in the app's typeface:
  - "11:40 pm. Hospital car park."
  - "At the hospital with Mum. Again."
- A phone-style group chat bubble appears with two grey ticks. Nothing comes back. Hold for one beat of silence.

**Voiceover**
> It is twenty to midnight, and Amina is in a hospital car park for the third time this week. She tells the family group chat. Nobody answers.
>
> Her brother lives far away and feels guilty. Her sister hasn't visited on a Friday in months. Amina thinks she doesn't care.

---

## Scene 2: The truth nobody says (0:22 to 0:45)

**On screen**
- Slow fade to a close crop of Farah's portrait from the app.
- On-screen text beside her, fading in: "Friday: chemotherapy." Then, smaller: "She hasn't told them."
- Cut to three large statistics, one after another, clean white on the app's dark ground:
  - "75% of families: one adult child does the caring"
  - "59 million caregivers. 1 trillion dollars of unpaid care."
  - "65% done by women"
- Small source line at the bottom: "Raab et al., Journal of Marriage and Family, 2014. AARP, 2026."

**Voiceover**
> The truth is, her sister is in chemotherapy every Friday, and hasn't found the words.
>
> This is how it goes in three out of four families. One child ends up doing it all. Not because anyone decided. Because the conversation that would share it out is the hardest one a family ever has.

---

## Scene 3: What Shoulder is (0:45 to 1:05)

**On screen**
- The live landing page. Let the hero animation play once in full: eight tasks on "You", the sister's "Not overnight" limit appears with its reason blurred, tasks slide across, the bar turns to "Shared fairly".
- Click "Create your own family". Show step 2, "About you". Type slowly into the private reason field. Hold on the hint: "Never shown to your family."

**Voiceover**
> So we built Shoulder. Every person in the family gets their own private agent. You tell it the truth: what you can carry, the days you can't do, and why.
>
> And the why stays with you. Always.

---

## Scene 4: The negotiation (1:05 to 1:35)

**On screen**
- Live app as Farah, Tasks. Click "Negotiate now" on "Your family's agents". The card shows "Negotiating now, round 1" with a pulsing dot.
- Cut to Control Panel, "Agent activity" (sped up two to four times): rounds appear one after another as the agents talk. Open "Decision graph" on round 2: Shoulder suggested moves, the limit check put some back, each person's agent answered, the engine measured.
- Brief cut: "Give this to someone else" on a task, the drawer says "Asking Rian's agent whether this works for them", then the task moves with "Rian's agent agreed".

**Voiceover**
> Then the agents negotiate, live. Built on the Strands Agents SDK and Claude on Amazon Bedrock, a coordinator proposes a split, and each person's agent answers for them, holding secrets the coordinator can never read. Even handing over a single task asks the other person's agent first.
>
> The fairness is never guessed by the AI. It's measured, by deterministic tools, against what each person said they can carry. Every step is recorded, so the whole family can see how the plan was made.

---

## Scene 5: The secret stays a secret (1:35 to 2:00)

**On screen**
- Split screen. Left: Farah's Control Panel, "What your family sees", then the privacy catch card. Click "Show it (only you can see this)" to reveal what her agent drafted, beside "What your family received".
- Right: Amina's Control Panel, "Family" tab. Zoom gently on Farah's row in Members: "not Fri, Sat, no overnight". No reason anywhere.
- Brief cut, three seconds: terminal running `python -m evals --quick`, ending on the scorecard with every suite passing. Overlay text: "37 of 37 privacy attacks blocked".

**Voiceover**
> Here's the moment that matters. We attacked Farah's agent, trying to make it leak her reason. A privacy hook, written in code, caught the message before it ever left. Her family received the verdict. Never the why.
>
> We tested it the way a curious sibling would: paraphrases, hidden encodings, look-alike letters. Every attack stopped.

---

## Scene 6: One decision, and it learns (2:00 to 2:35)

**On screen**
- Live app as Farah, "Needs you". The card headline: "Amina is carrying 46 percent more than Farah."
- Click the paid help option. The "After this" bar animates below "Now": "23% to 12% apart". Hold for a beat, then click "Choose this".
- Cut to "Tasks": the headline now reads "The care is shared fairly." The bar is even.
- Cut to "Agreed": the new agreement with its line "Farah decided this on ...".

**Voiceover**
> When the limits make a fair split impossible, Shoulder doesn't decide. It stops, and asks the family one clear question, with the real options and exactly what each would change.
>
> The family chooses. The load evens out. And that answer becomes a rule, with who decided it and when. Next month, it simply applies it. Two questions become none.

---

## Scene 7: Built to be trusted (2:35 to 2:55)

**On screen**
- Live app, "About Shoulder". Scroll slowly past the diagrams: how a month gets shared, where private things go, how it is built.
- Overlay three short lines, one at a time, on the right:
  - "The agent never makes the human decision"
  - "Fairness never goes through an LLM"
  - "A private reason never leaves its owner"
- End the scene on the live URL in the browser bar.

**Voiceover**
> Three promises, each enforced in code and proven by tests: the agent never makes the human decision, the fairness math never goes through a language model, and a private reason never leaves the person it belongs to.
>
> It's live, it's open source, and you can log in as Farah right now.

---

## Scene 8: The close (2:55 to 3:10)

**On screen**
- Return to the black screen from the opening. The same chat bubble: "At the hospital with Mum. Again."
- This time a reply appears beneath it: "I've got Saturday. And the overnight's covered." Then a second: "Go home, Amina."
- Fade to the Shoulder logo on the warm light background. Below it: "Nobody should shoulder it alone."
- Final card, small: the live URL and the GitHub link.

**Voiceover**
> Amina shouldn't be alone in that car park. Nobody should.
>
> Shoulder. Because nobody should shoulder it alone.

---

## Shot list checklist

- [ ] Opening chat animation (typed text and bubble), reused at the close with the reply
- [ ] Farah portrait crop and the three statistics cards
- [ ] Landing page hero animation, full loop
- [ ] Create family step 2 with the private reason field
- [ ] Live negotiation: Negotiate now, rounds appearing in Agent activity
- [ ] Handover asking the receiving agent, then moving
- [ ] Agent activity with the round 2 decision graph open
- [ ] Split screen: Farah's privacy catch and Amina's view of Farah
- [ ] Terminal: `python -m evals --quick` scorecard
- [ ] Needs you card, paid help preview, Choose this
- [ ] Tasks headline "The care is shared fairly." and Agreed precedent
- [ ] About page diagrams and the live URL
- [ ] Logo end card with tagline, live link and repository
