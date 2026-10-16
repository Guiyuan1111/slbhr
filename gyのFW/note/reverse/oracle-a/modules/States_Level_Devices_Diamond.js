// 模块: States/Level/Devices/Diamond  (init.beautified.js L56334-L56409)
      define("States/Level/Devices/Diamond", ["Phaser"], function () {
        "use strict";

        var c;
        return c = c = function (c) {
          function d(b, c, e, f) {
            this.grabbed = a(this.grabbed, this);
            var g;
            var h;
            var i;
            c += b.physics.box2d.mpx(1);
            e -= b.physics.box2d.mpx(1);
            d.__super__.constructor.call(this, b, c, e, "CharAssets", "_default0000");
            this.game.physics.box2d.enable(this);
            this.sprite = b.make.sprite(0, 0, "CharAssets", "diamond_" + f + "0000");
            this.sprite.anchor.set(0.5);
            this.addChild(this.sprite);
            this.signal = new Phaser.Signal();
            this.body.clearFixtures();
            this.body.mass = 0;
            i = new box2d.b2PolygonShape();
            i.SetAsOrientedBox(this.options.width / 2, this.options.height / 2, new box2d.b2Vec2(0, 0), 0);
            h = new box2d.b2FixtureDef();
            h.shape = i;
            h.friction = 0.7;
            h.restitution = 0;
            h.density = 0;
            h.userData = "diamond-" + f;
            h.isSensor = true;
            h.userData = {
              lightProperties: {
                type: "transparent"
              }
            };
            this.data.char = f;
            g = this.body.data.CreateFixture(h);
            g.id = this.body.world.getNextFixtureId();
            this.game.layers.underGround.addChild(this);
            this.body.setFixtureContactCallback(g, function (a) {
              return function (b, c, d, e, f, g) {
                if (c.sprite.character != null && c.sprite.character.data.char && (a.data.char === "silver" || a.data.char === "fbwg" || c.sprite.character.data.char === a.data.char) && f) {
                  console.log("Grabbed!");
                  a.grabbed(c.sprite.character);
                  return a.signal.dispatch();
                }
              };
            }(this), this);
            this.sprite.y = -5;
            _.delay(function (a) {
              return function () {
                var b;
                b = a.game.add.tween(a.sprite).to({
                  y: 5
                }, 2000, Phaser.Easing.Sinusoidal.InOut, true);
                return b.yoyo(true).loop();
              };
            }(this), Math.random() * 2000);
            return this;
          }
          b(d, c);
          d.prototype.options = {
            width: 0.7,
            height: 0.7
          };
          d.prototype.grabbed = function (a) {
            this.game.level.sounds.diamond.play();
            if (this.data.char === "silver") {
              a.data.silverDiamond++;
            } else {
              a.data.diamonds++;
            }
            return this.destroy();
          };
          return d;
        }(Phaser.Sprite);
      });