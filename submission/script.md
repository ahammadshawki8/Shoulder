# Shoulder: demo video script

**Target length:** about 3 minutes 10 seconds (hard limit 3 minutes 30 seconds)
**Voice:** like talking to a friend over coffee. Warm, calm, a little personal. Pause where a sentence ends. Don't perform it; mean it.
**Music:** soft piano under the opening, lifting a little when Shoulder arrives, gentle again at the close. Always under the voice.

---

## Before recording

- **Live app:** https://shoulder-100-56-157-153.sslip.io . Use a fresh browser profile, 1440 by 900, zoom 110 percent, light theme.
- **Start fresh.** Restart the app right before you record, so the Rahman family is exactly as it begins:
  `ssh -i ~/.ssh/shoulder-deploy.pem ubuntu@100.56.157.153 'cd /opt/shoulder/deploy && sudo docker compose restart app'`
- **Scenes 4, 5 and 6 are one real story. Record them in one go, logged in as Farah** (`rahman` / `farah`). The agents talk for about three minutes, Farah makes a choice, and the agents talk again by themselves about a minute and a half later. Speed up the waiting in the edit.
- **The agents are live.** Their exact words will be a little different from the examples below. That's fine; the story stays the same.
- **Two browser windows side by side** for scene 5: Farah on the left, Amina on the right (`rahman` / `amina`), each in its own private window.
- **A terminal** with a big font, for one three-second shot: `python -m evals --quick`.
- Record the screen first, then add the voice on top. Cut at the end of a sentence, never in the middle.

---

## Scene 1: Nobody answers (0:00 to 0:20)

**On screen**
- Black screen. White text types itself out, slowly:
  - "11:40 pm. Hospital car park."
  - "At the hospital with Mum. Again."
- A group chat message appears. Two grey ticks. No reply. Stay on the silence for a moment.

**Voiceover**
> It's almost midnight. Amina is sitting in a hospital car park, for the third time this week.
>
> She messages her brother and sister. Nobody replies.

---

## Scene 2: What nobody says out loud (0:20 to 0:45)

**On screen**
- Slow fade to Farah's photo from the app.
- Small text fades in beside her: "Fridays: chemotherapy." Then, smaller still: "She hasn't told them."
- Three simple number cards, one after another:
  - "In 3 out of 4 families, one child does the caring"
  - "59 million people. 1 trillion dollars of unpaid care."
  - "65% of it done by women"
- Tiny source line at the bottom: "Raab et al., Journal of Marriage and Family, 2014. AARP, 2026."

**Voiceover**
> Her sister hasn't visited on a Friday in months. Amina thinks she doesn't care. The truth is, Farah has chemotherapy every Friday. She just hasn't found the words yet.
>
> And Amina? She has never once said no to her family.
>
> This happens in three out of four families. One person ends up carrying everything. Not because anyone chose it. Because talking about it is just too hard.

---

## Scene 3: Say it for me (0:45 to 1:05)

**On screen**
- The live landing page. Let the animation play once: all the tasks sit on one person, then slide across until the bar reads "Shared fairly".
- Click "Create your own family". On step 2, type slowly into the private reason box. Hold on the line under it: "Never shown to your family."
- Cut to Amina's Control Panel, "Your agent". Slowly scroll through what she wrote: "I never say no to my family, even when I should. When my share is too much, say it for me."

**Voiceover**
> So we built Shoulder.
>
> Everyone in the family gets their own private AI agent. You tell it the truth. What you can do, what you can't, and why. And the why never leaves you.
>
> Amina told hers something she's never told anyone. When it's too much, say no for me.

---

## Scene 4: Somebody finally says no (1:05 to 1:40)

**On screen**
- As Farah, on Tasks. Click "Negotiate now". The card changes to "Negotiating now, round 1" with a soft pulsing dot.
- Cut to Control Panel, "Agent activity", sped up. Round 1 appears. Zoom in on Amina's agent, with the amber "Wants changes" tag and its words, something like: "Three overnight stays this month is more than I can manage." Rian's and Farah's agents say it works for them.
- Round 2: open "Decision graph". It shows Shoulder trying to give the Saturday overnight to Rian, the check saying that makes it less fair, and the old plan being kept.
- Let rounds 3 and 4 go by quickly. Stop on "Handed to the family", where Shoulder was stopped from booking paid help by itself.

**Voiceover**
> Then the agents sit down and work it out, running live on Claude through Amazon Bedrock.
>
> And for the first time, someone says no. It's Amina's agent. Three overnight stays this month is more than she can handle.
>
> Shoulder tries passing one to Rian. But the maths says that's even less fair, so it keeps looking. It could just pay for outside help. It's not allowed to. That's a family's decision.

---

## Scene 5: Secrets stay secret (1:40 to 2:05)

**On screen**
- Two windows side by side. Left: Farah's Control Panel, the card "The privacy check stopped a message". Click "Show it (only you can see this)" to reveal what her agent tried to say, next to what the family actually received.
- Right: Amina's Control Panel, "Family" tab. Zoom gently on Farah's row: "not Fri, Sat, no overnight". No reason anywhere.
- A quick three-second cut to the terminal finishing `python -m evals --quick`, every check passing. Text on screen: "37 of 37 privacy attacks blocked".

**Voiceover**
> And here's what nobody found out. Not why Amina is struggling. Not why Farah can't do Fridays.
>
> We even tried to trick Farah's agent into giving her secret away. A privacy check caught it before it went anywhere. Her family got her answer. Never her reason.

---

## Scene 6: One choice, and it's settled (2:05 to 2:40)

**On screen**
- Still as Farah, open "Needs you". The card reads: "Amina is carrying 46 percent more than Farah."
- Click the paid help option (the Wednesday overnight stay and the Friday appointment). The "After this" bar slides below "Now": "23% to 12% apart". Wait a beat, then click "Choose this".
- Cut to Tasks: "The care is shared fairly." The agents card says "Negotiating in about 1 minute". Jump ahead to it running, then to "The agents settled the plan".
- Cut to "Agreed": Farah's choice, with "Farah decided this on ...".

**Voiceover**
> So instead of deciding for them, Shoulder asks the family one simple question, and shows exactly what each answer would change.
>
> Farah picks paid help for the overnight Amina couldn't face. The agents take it from there. They talk it through again, the load is finally fair, and the plan is done.
>
> Nobody had to have that hard conversation.

---

## Scene 7: Why you can trust it (2:40 to 2:58)

**On screen**
- Live app, "About Shoulder". Scroll slowly past the three diagrams.
- Three short lines appear on the right, one at a time:
  - "The agent never makes the big decisions"
  - "The fairness maths never goes through AI"
  - "Your reasons never leave you"
- End on the live web address in the browser bar.

**Voiceover**
> We built it on three promises, and every one is checked in code. The agent never makes the big decisions. The fairness maths is never left to AI. And your reasons never leave you.
>
> It's live right now. You can log in as Farah and see for yourself.

---

## Scene 8: Go home, Amina (2:58 to 3:10)

**On screen**
- Back to the black screen from the start. The same message: "At the hospital with Mum. Again."
- This time a reply appears: "I've got Saturday. And the overnight's covered." Then another: "Go home, Amina."
- Fade to the Shoulder logo on a warm light background. Underneath: "Nobody should shoulder it alone."
- A small final card with the live link and the GitHub link.

**Voiceover**
> Amina shouldn't be sitting alone in that car park. Nobody should.
>
> Shoulder. Because nobody should shoulder it alone.

---

## Shot list

- [ ] The opening chat message with no reply, and the same chat with replies for the ending
- [ ] Farah's photo, and the three number cards
- [ ] The landing page animation, one full loop
- [ ] Step 2 of creating a family, with the private reason box
- [ ] Amina's "Your agent" page ("say it for me")
- [ ] As Farah: "Negotiate now", and rounds appearing in Agent activity
- [ ] Amina's agent saying "Wants changes", and the round 2 decision graph
- [ ] "Handed to the family", where Shoulder is stopped from booking paid help
- [ ] Side by side: Farah's privacy catch and Amina's view of Farah
- [ ] The terminal: `python -m evals --quick` all passing
- [ ] The Needs you card, the paid help preview, and "Choose this"
- [ ] The agents talking again by themselves, then "The agents settled the plan"
- [ ] The Agreed page, showing who decided
- [ ] The About page diagrams and the live address
- [ ] The logo end card with the tagline and links
