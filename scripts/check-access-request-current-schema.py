#!/usr/bin/env python3
"""Require exact current production equality after replaying the reviewed tail.

The historical Stage A delta check still runs before this tail is applied.
This gate accepts neither the pre-Stage-A schema nor a partial deployment.
"""
import argparse
import runpy
from pathlib import Path

read = runpy.run_path(str(Path(__file__).with_name('check-access-request-delta.py')))['read']


def check(current, production):
    if not current or not production:
        raise ValueError('empty current or production signature manifest')
    differences = sorted(key for key in current.keys() | production.keys()
                         if current.get(key) != production.get(key))
    if differences:
        raise ValueError(f'production drift blocks delivery: {differences}')
    return f'current: production/replay identical ({len(current)} objects)'


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('current')
    parser.add_argument('production')
    args = parser.parse_args()
    print(check(read(args.current), read(args.production)))
