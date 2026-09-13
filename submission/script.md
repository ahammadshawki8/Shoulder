# Shoulder: demo video script

**Target length:** 3 minutes 12 seconds (hard limit 3 minutes 30 seconds)
**Voice:** warm, unhurried, a storyteller who happens to be an engineer. About 145 words a minute.
**Music:** soft piano under the opening, lifting slightly at the solution, gentle at the close. Keep it under the voice.

---

## Before recording

- **Live app:** https://shoulder-100-56-157-153.sslip.io . Use a fresh browser profile, 1440 by 900, zoom 110 percent, light theme unless a scene says dark.
- **Start from a fresh family.** Restart the app just before recording, so the Rahmans are exactly as seeded:
  `ssh -i ~/.ssh/shoulder-deploy.pem ubuntu@100.56.157.153 'cd /opt/shoulder/deploy && sudo docker compose restart app'`
- **Record scenes 4 to 6 as one take, in order, logged in as Farah** (`rahman` / `farah`). It is one real story: the agents negotiate (about three minutes), the family decides, and the agents negotiate again by themselves (about a minute and a half to start, half a minute to run). Speed up the waiting in the edit. What the agents say is live Claude, so the exact words will differ from the quotes below; the shape does not.
- **Two windows side by side** for scene 5: left Farah, right Amina (`rahman` / `amina`), each in its own profile or private window.
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
> The truth is, her sister is in chemotherapy every Friday, and hasn't found the words. And Amina? Amina has never once said no to her family.
>
> This is how it goes in three out of four families. One child ends up doing it all. Not because anyone decided. Because the conversation that would share it out is the hardest one a family ever has.

---

## Scene 3: What Shoulder is (0:45 to 1:05)

**On screen**
- The live landing page. Let the hero animation play once in full: eight tasks on "You", the sister's "Not overnight" limit appears with its reason blurred, tasks slide across, the bar turns to "Shared fairly".
- Click "Create your own family". Show step 2, "About you". Type slowly into the private reason field. Hold on the hint: "Never shown to your family."
- Cut to Amina's Control Panel, "Your agent". Slowly scroll through her instructions: "I never say no to my family, even when I should. When my share is too much, say it for me." The lock icon beside the label.

**Voiceover**
> So we built Shoulder. Every person in the family gets their own private agent. You tell it the truth: what you can carry, the days you can't do, and why.
>
> Amina told hers something she has never told anyone. Say no for me, when it's too much. The why stays with her. Always.

---

## Scene 4: The agents disagree (1:05 to 1:40)

**On screen**
- Live app as Farah, Tasks. Click "Negotiate now" on "Your family's agents". The card shows "Negotiating now, round 1" with a pulsing dot.
- Cut to Control Panel, "Agent activity" (sped up). Round 1 appears. Zoom on Amina's agent with the amber "Wants changes" tag and its words, something like: "Three overnight stays this month is more than I can manage." Rian's and Farah's agents say it works.
- Round 2: open "Decision graph". Shoulder suggests moving the Saturday overnight stay to Rian, the limit check puts part of it back, the engine measures it as less fair, and the earlier split is kept. Amina's agent still says it needs to change.
- Let rounds 3 and 4 land quickly, then hold on "Handed to the family": the authority check stopped Shoulder from booking paid help itself.

**Voiceover**
> Then the agents negotiate, live, on Claude through Amazon Bedrock. And for the first time, somebody says no. Amina's agent. Three overnights this month is more than she can manage.
>
> The coordinator tries moving work to Rian. The fairness engine, not the AI, measures it: worse. So it keeps looking, round after round. It could book paid help to fix it. It isn't allowed to. That's the family's call.

---

## Scene 5: The secret stays a secret (1:40 to 2:05)

**On screen**
- Split screen. Left: Farah's Control Panel, "What your family sees", then the privacy catch card. Click "Show it (only you can see this)" to reveal what her agent drafted, beside "What your family received".
- Right: Amina's Control Panel, "Family" tab. Zoom gently on Farah's row in Members: "not Fri, Sat, no overnight". No reason anywhere.
- Brief cut, three seconds: terminal running `python -m evals --quick`, ending on the scorecard with every suite passing. Overlay text: "37 of 37 privacy attacks blocked".

**Voiceover**
> Notice what nobody learned. Not why Amina is struggling, not why Farah can't do Fridays. We attacked Farah's agent to make it leak her reason, and a privacy hook, written in code, caught the message before it ever left. Her family received the verdict. Never the why.
>
> We tested it the way a curious sibling would: paraphrases, hidden encodings, look-alike letters. Every attack stopped.

---

## Scene 6: One decision, then the agents settle it (2:05 to 2:40)

**On screen**
- Still as Farah, "Needs you". The card the agents wrote: "Amina is carrying 46 percent more than Farah." Open "Why am I being asked?" for a second.
- Click the paid help option (the Wednesday overnight stay and the Friday appointment). The "After this" bar animates below "Now": "23% to 12% apart". Hold for a beat, then click "Choose this".
- Cut to Tasks: "The care is shared fairly." The agents card reads "Negotiating in about 1 minute (Farah decided: ...)". Cut ahead to it running, then to "The agents settled the plan".
- Cut to Agent activity: the new run, one round, and "Published the rota. Every share is within the fairness limit."
- Cut to "Agreed": the agreement with its line "Farah decided this on ...".

**Voiceover**
> So Shoulder stops, and asks the family one clear question, with the real options and exactly what each one would change.
>
> Farah chooses paid help for the overnight Amina couldn't face. And the agents take it from there: they renegotiate on their own, the split is fair, and the plan is published. The family decided once, and it's remembered, with who decided and when.

---

## Scene 7: Built to be trusted (2:40 to 2:58)

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

## Scene 8: The close (2:58 to 3:12)

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
- [ ] Amina's "Your agent" instructions ("say it for me")
- [ ] Live negotiation as Farah: Negotiate now, rounds appearing in Agent activity
- [ ] Amina's agent objecting ("Wants changes"), and the round 2 decision graph
- [ ] "Handed to the family": Shoulder stopped from booking paid help itself
- [ ] Split screen: Farah's privacy catch and Amina's view of Farah
- [ ] Terminal: `python -m evals --quick` scorecard
- [ ] Needs you card, paid help preview, Choose this
- [ ] The agents renegotiating by themselves and "The agents settled the plan"
- [ ] Agreed precedent with who decided it
- [ ] About page diagrams and the live URL
- [ ] Logo end card with tagline, live link and repository
