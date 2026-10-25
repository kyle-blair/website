#! /usr/bin/env python3

import secrets;

alphabet = "23456789abcdefghjklmnpqrstuvwxyz";

id = "".join(secrets.choice(alphabet) for _ in range(8));
print(id);
