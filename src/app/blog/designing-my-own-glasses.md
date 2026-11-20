# designing my own glasses

Date: 2026-11-05

## the intro

*Note that this is a work in progress. I will likely make edits here and/or create
additional blog posts as time goes on.*

A month or two ago, I fell asleep with my glasses on. While asleep, I rolled over and
that was all it took; my glases are borked. Now, they still technically work, but one of
the hinges is damaged and they're all wonky. They're a basic acetate frame with metal
hinges embedded in the acetate, and metal arms. So, I set off for my optician's office.

## the problem

They had previously told me that acetate frames basically "wear out" and eventually crack
or break when they're heated in order to replace lenses. I never knew that. I asked them
if they have any "buy it for life" type frames. They pointed me to some titanium frames.
Now we're on the right track. Titanium is awesome. The frames, however, were these dainty,
designer pieces. There were only a couple. They leveraged the strength of titanium in
order to make the rims tiny. I don't remember their exact price, but I'm pretty sure it
was greater than $400. I figured it couldn't be too hard to make a modular, machinable
frame that was competitive with existing offerings. I was kind of right. Maybe.

## the solution

I started with a few basic design requirements:

- Sturdy enough to survive falling asleep with them on...
- Capable of lasting a lifetime.
- Comfortable, even for full-time wear.
- The frame and its parts are (CNC) machinable, meaning replacement parts can be
  independently sourced.

The first one is obvious. The second one meant acetate was out. It also potentially rules
out aluminum, since uncoated aluminum can wear away, and coatings will wear as well. My
iPhone and MacBook Pro can attest to the fact that premium, machined aluminum products
have visible signs of wear within a year or two. Titanium is ideal in many ways. It's very
strong, and has a high strength-to-weight ratio, however it is also very dense. That led
to an additional design requirement:

- The frames should weigh less than 30 grams.

That has turned out to be one of the most difficult constraints. It is entirely an
estimate, but the heavier they are the more pressure they put on your nose. It might
require a prototype run or some other hands-on testing to determine if that value is
acceptable. I may need to decrease weight even more if comfort is an issue at 30 grams.
It makes a lot more sense now why titanium frames typically use very small, extruded
parts. Strength and machinability goals means features can only be so small before they
become very impractical. Alas, an even more problematic constraint might have arisen:
cost. Now, I will make these frames for myself no matter the cost, but there is still a
question around the price and marketability of manufacturing and selling them to others.
Here's a breakdown of the cost based on an online CNC service's quote. For 500 frames
consisting of 8 unique parts (some parts are used more than once in an assembled frame):

$72,525 total
$145.05 per frame
($145.05 manufacturing cost + $55 estimated remaining fixed costs) * 3x margin = $600.15

Ouch. More than I wanted; I am hoping to get the retail price in the $200-$400 range.
However, I've easily spent more than $600 on frames over my lifetime, so it could still be
financially competitive if the frames last a lifetime. Compromising with aluminum, the
manufacturing cost per frame could possibly be cut in half, down to around $75.

One interesting benefit of the modular design is that you can have vastly different styles
all built around the same underlying parts. I have already created multiple rim styles; I
will generate a render of some round rims that I like and add them here later.

## images

Here are some renders of the current prototype. Almost everything is subject to change.

**isometric**

![Isometric view of my open glasses frame design](/iso-open.png)

**front**

![Front view of my open glasses frame design](/front-open.png)

**back**

![Back view of my open glasses frame design](/back-open.png)

**left**

![Left view of my open glasses frame design](/left-open.png)

**right**

![Right view of my open glasses frame design](/right-open.png)

**top**

![Top view of my open glasses frame design](/top-open.png)

**bottom**

![Bottom view of my open glasses frame design](/bottom-open.png)

**isometric**

![Isometric view of my folded glasses frame design](/iso-folded.png)

**front**

![Front view of my folded glasses frame design](/front-folded.png)

**back**

![Back view of my folded glasses frame design](/back-folded.png)

**left**

![Left view of my folded glasses frame design](/left-folded.png)

**right**

![Right view of my folded glasses frame design](/right-folded.png)

**top**

![Top view of my folded glasses frame design](/top-folded.png)

**bottom**

![Bottom view of my folded glasses frame design](/bottom-folded.png)
