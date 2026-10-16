// 模块: States/Common/Navies  (init.beautified.js L39275-L39343)
      define("States/Common/Navies", ["./Button", "Phaser"], function (c) {
        "use strict";

        var d;
        return d = d = function (c) {
          function d(b, c, e, f) {
            var g;
            var h;
            var i;
            var j;
            if (f == null) {
              f = 3;
            }
            this.update = a(this.update, this);
            d.__super__.constructor.call(this, b, c, e, "MenuAssets", "_default0000");
            this.anchor.set(0.5);
            g = h = 0;
            j = f;
            for (; j >= 0 ? h <= j : h >= j; g = j >= 0 ? ++h : --h) {
              i = new Phaser.Sprite(b, 0, 0, "MenuAssets", "Navy0000");
              i.anchor.set(0.5);
              i.scale.set(0.3 + Math.random() * 0.7);
              i.offsetCart = {
                x: (Math.random() - 0.5) * 200,
                y: (Math.random() - 0.5) * 50
              };
              i.offset = {
                r: Math.random() * 400,
                theta: Math.random()
              };
              i.rprime = 0;
              i.speed = {
                r: 0.0007 + Math.random() * 0.0005,
                theta: 0.0003 + (Math.random() - 0.5) * 0.0005
              };
              i.pos = {
                r: Math.random(),
                theta: Math.random() * Math.PI * 2
              };
              i.update = function () {
                this.rprime += this.speed.r;
                this.pos.r = this.offset.r * Math.sin(this.rprime);
                this.pos.theta += this.speed.theta;
                this.x = this.offsetCart.x + this.pos.r * Math.cos(this.pos.theta);
                return this.y = this.offsetCart.y + this.pos.r * Math.sin(this.pos.theta);
              };
              this.addChild(i);
            }
          }
          b(d, c);
          d.prototype.update = function () {
            var a;
            var b;
            var c;
            var d;
            var e;
            d = this.children;
            e = [];
            b = 0;
            c = d.length;
            for (; b < c; b++) {
              a = d[b];
              e.push(a.update.call(a));
            }
            return e;
          };
          return d;
        }(Phaser.Sprite);
      });