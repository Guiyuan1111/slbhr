#!/usr/bin/env python3
# oracle bundle 切片工具（只读）：按 offset 打印 [s,e) 字节（latin1）
# 用法: python3 slice_bundle.py <game A-E> <start> <end> [start2 end2 ...]
import sys

BASE = "/home/gy/桌面/dev/slbhr/Fireboy-and-Watergirl/output"

def main():
    game = sys.argv[1]
    path = f"{BASE}/{game}/js/" + __import__("os").listdir(f"{BASE}/{game}/js")[0]
    data = open(path, "rb").read()
    args = [int(x) for x in sys.argv[2:]]
    for i in range(0, len(args), 2):
        s, e = args[i], args[i + 1]
        print(f"===== {game} @{s}:{e}")
        print(data[s:e].decode("latin1"))

if __name__ == "__main__":
    main()
