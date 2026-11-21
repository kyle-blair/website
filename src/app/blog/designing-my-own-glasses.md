# designing my own glasses

Date: 2026-11-19

## the intro

A month or two ago, I fell asleep with my glasses on. While asleep, I rolled over and
that was all it took; my glases are borked. Now, they still technically work, but one of
the hinges is damaged and they're all wonky. They're a basic acetate frame with metal
hinges embedded in the acetate, and metal arms. So, I set off for my optician's office.

## the problem

They had previously told me that acetate frames basically "wear out" and eventually crack
or break when they're heated in order to replace lenses. I never knew that. I asked them
if they have any "buy it for life" type frames. They pointed me to some titanium frames.
Now we're on the right track. Titanium is awesome. The frames, however, were these dainty,
designer pieces. There were only a couple. I don't remember their exact price, but I'm
pretty sure it was greater than $400. I figured it couldn't be too hard to make a modular,
machinable frame that was competitive with existing offerings. I was kind of right. Maybe.

## designing a solution

I have yet to devise a gradation among design "goals" and "requirements". I guess I
shouldn't reinvent the wheel. I can use the must, should, could, won't framework.

- Must be sturdy enough to survive falling asleep with them on...
- Should be capable of lasting a lifetime.
- Must be comfortable enough for full-time wear.
- Must be independently sourceable. That means design files are (ideally indefinitely)
  available and are sufficient to reproduce the entirety of the product.
- Could be user-adjustable in certain dimensions to provide a comfortable fit for a
  broader range of anatomies or preferences.
- Could be modular.

The first one is obvious. The second one meant acetate was out. It also potentially rules
out aluminum, since uncoated aluminum can wear down, and coatings will wear as well. My
iPhone and MacBook Pro can attest to the fact that premium, machined aluminum products
have visible signs of wear within a year or two (or at least the coatings do). Titanium is
ideal in many ways. It forms a natural oxide coating that makes it more resistant to wear
than aluminum, no coating required. It has a high strength-to-weight ratio. However, it is
also very dense. That led to an additional design goal (really a sub-goal of comfort):

- The frames should weigh less than 30 grams.

That has turned out to be one of the more difficult constraints. It is entirely an
estimate, but the heavier they are the more pressure they put on your nose. It might
require a prototype run or some other hands-on testing to determine if that value is
acceptable. I may need to decrease weight even more if comfort is an issue at 30 grams.
It makes a lot more sense now why titanium frames typically use very small, extruded
parts. My strength and machinability goals mean features can only be so small before they
become very impractical. Using aluminum instead of titanium makes weight almost a
non-issue at the cost of strength and longevity.

### cost

Alas, an even more problematic constraint might have arisen: cost. Now, I will probably
make these frames for myself no matter the cost, but there is still a question around the
price and marketability of selling them as a product. Here's a breakdown of the cost based
on an online CNC service's quote. For 500 frames consisting of 8 unique parts (some parts
are used more than once in an assembled frame):

$72,525 total
$145.05 per frame
($145.05 manufacturing cost + $55 estimated additional costs) * 3x margin = $600.15

Ouch. More than I wanted; I am hoping to get the retail price in the $200-$400 range.
However, I've easily spent more than $600 on frames over my lifetime, so it could still be
financially competitive if the frames last a lifetime. Compromising with aluminum, the
manufacturing cost per frame could possibly be cut in half, down to around $75. But I also
want to include a fancy case machined from the the same material as the glasses. That case
would substantially increase cost. I'd prefer to laser engrave at least some model/brand
markings on the frames and that adds cost per unit (per marking). I may need to request
tighter manufacturing tolerances on certain features, which costs more. So, cost is also a
significant constraint. You'll notice, though, that cost is not a design goal. I still
have plenty of options to explore around reducing cost. Also, the eyewear market is large
and there are many existing frames in the $500-$1,000 range and even higher, so an
exorbitant cost doesn't necessarily preclude retail. Once again, using aluminum instead of
titanium could potentially cut costs in half.

### aesthetics

One interesting benefit of the modular design is that you can have vastly different styles
all built around the same underlying parts. I'm not thrilled with the aesthetics of what
I'm calling the "default" rim shape, but, thanks to modularity, that is very easy to
change. I'm focusing solely on function first, so the rims are large to allow an
unobstructed view, with straight edges because they're easier to deal with in
computer-aided design software :). I genuinely believe that maximizing function inherently
yields particularly aesthetic forms and is therefore one of my preferred design practices.
If you can inspect one of the Mars rovers or the James Webb space telescope without
finding them absolutely gorgeous, then you and I are probably not cut from the same cloth.
I have also already created alternate rim styles; I will generate a render of some round
rims that I like and they should be available below at some point.

## images

Here are some renders of the current prototype.

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
