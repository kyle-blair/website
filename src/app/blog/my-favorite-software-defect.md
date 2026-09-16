# my favorite software defect

Date: 2026-09-15

## the intro

It was some time around 2016.
For fun, I was writing software to connect to the Coinbase cryptocurrency exchange.
It wasn't so much about crypto, rather that crypto exchanges had well-documented APIs and
allowed programmatic trading without much todo.
I wanted to calculate things that Coinbase didn't (such as trading indicators), create my
own user interface, and make a million dollars via medium frequency trading.

## the problem

Anyways, cryptocurrency such as Bitcoin famously has eight decimal places of precision for
quantity, so I was using `java.math.BigDecimal` in many places because it supports arbitrary
precision.
For consistency, I decided to use it everywhere, including for technical indicators.
I ran this software indefinitely on the desktop PC I built around 2012.
Eventually, I noticed memory and cpu use would increase substantially.
This was on an Intel i7-2700k overclocked to 4.6GHz by the way.
I just started that PC up to confirm the cpu model; it still works suprisingly well,
despite being 14 years old!
I would also run trading strategy simulations against years worth of historical price
data, and these too were slow.

Determined to crunch numbers faster and therefore get rich faster, I tried all manner of
optimizations to no avail.
I even spent a ton of time implementing a persistence layer so I could record all sorts of
stuff in a database to avoid the expensive calculations.
Then one day I had an epiphany, the genesis of which I genuinely can't remember.
You see, the trading indicators--which would recalculate with every single change in
price, potentially many times a second--often multiplied the prior value with another
number.
So, `10 * 10 = 100`.
Simple, right?
But `1.1 * 1.1 = 1.21`.
Then, `1.21 * 1.1 = 1.331`.
When multiplying decimal values together, the precision increases.
BigDecimal's arbitrary precision, coupled with my naievity, led to unconstrained growth
in the number of decimal places.
At first, things went smooth, but eventually even a powerful cpu struggled to calculate
who-knows-how-many decimal places.

## the solution

The solution all along was to add one line of code to truncate the precision (or scale) to
two decimal places after each calculation:

```java
ema = ema.setScale(2, BigDecimal.ROUND_HALF_UP);
```

## the lessons learned

I learned many things from this experience.
It taught me that you can waste an incredible amount of time by not truly understanding a
problem.
Ever since, I write software under the assumption that it will run indefinitely.
I learned the importance of automated tests.
Unit tests.
Functional tests.
Tests using representative, real-world data.
The importance of using a debugger.
Once I did run this code through the debugger, I easily noticed the amount of time spent
in BigDecimal's arithmetic operations and the growing amount of memory spent on BigDecimal
storage.
It single-handedly represents the quintessential distinction between my days as a novice
software engineer and my days as a...slightly more inquisitive and cautious one.
