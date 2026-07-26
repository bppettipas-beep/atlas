# Product

## What Atlas is

An operating system for a small business. It holds the people, knowledge, tasks
and processes that make a company run, and shows how they connect.

Atlas answers six questions an owner asks constantly and currently answers by
messaging people:

1. Who works here?
2. What does each person know, own, and have on their plate right now?
3. How do people, teams, skills and responsibilities connect?
4. What is due, blocked, late, or finished?
5. What does a new hire need to learn?
6. What changed inside the company recently?

## Who uses it

**The owner or manager.** Runs a 5–50 person operating business — facilities,
trades, hospitality, care, retail, logistics. Not a software company. Their
current system is a whiteboard, a group chat, a spreadsheet, and their own
memory. They are the single point of failure for institutional knowledge and
they know it. They are at a desk on a laptop, usually between other things.

**The worker.** On a site, in a van, on a shop floor. Often on a phone, often
with one hand free, sometimes with poor signal. They need to know what to do
today and have a fast way to say "done" or "I'm stuck". Every second of friction
is a task that gets done but never recorded.

These two are asking genuinely different questions, so they get different front
doors: the owner lands on the Organization Map, the worker lands on My Day. A
worker never sees a trimmed-down owner dashboard.

## What makes it different

Most tools in this space are either a task list with an org chart bolted on, or
an HR system with no idea what work is happening. Atlas's premise is that
**structure and work are the same data**: the reporting lines, teams, shared
skills and knowledge ownership on the map are *derived* from tasks, profiles and
documents, not maintained separately. Nobody has to remember to update the org
chart, because there is nothing separate to update.

## Non-negotiables

- **PostgreSQL is the source of truth.** No third-party backend. The owner's
  data is in a database they can point at, back up, and take with them.
- **Authorisation is enforced on the server.** Hidden buttons are a courtesy;
  the API is the boundary.
- **A blocker must be explainable.** A worker cannot mark something blocked
  without saying why, and saying why notifies their manager immediately. This is
  the single most valuable thing the product does.
- **The business has a memory.** Every meaningful change is recorded in an
  activity feed, so "when did that change and who did it" always has an answer.
- **Beginner-editable.** The owner may be the person maintaining this. Modules
  are small, plainly named, and commented where the reasoning is not obvious.

## Platform

Web, responsive. Desktop is where an owner works and must be excellent. Mobile
is where a worker works and must make completing, commenting and reporting a
blocker easy with one thumb.

## Voice

Plain, specific, and never chirpy. Errors name the problem and the recovery
("That invitation code has expired. Ask your manager for a new one."). Labels
name the action. No exclamation marks, no "Oops!", no jargon a facilities
manager would not use out loud.
