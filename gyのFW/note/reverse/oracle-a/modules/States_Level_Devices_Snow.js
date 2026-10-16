// 模块: States/Level/Devices/Snow  (init.beautified.js L59101-L59229)
      define("States/Level/Devices/Snow", ["Phaser"], function () {
        "use strict";

        var c;
        return c = c = function (c) {
          function d(b, c, e) {
            this.drawTile = a(this.drawTile, this);
            this.createSnowGraphics = a(this.createSnowGraphics, this);
            var f;
            var g;
            var h;
            var i;
            var j;
            var k;
            var l;
            var m;
            this.ground = c;
            this.options = {};
            this.options.data = e;
            if (e.dir === "SW") {
              i = e.length * Math.sqrt(2);
              this.options.y = e.x + e.length / 2;
              this.options.x = e.y + e.length / 2;
            } else if (e.dir === "SE") {
              i = e.length * Math.sqrt(2);
              this.options.y = e.x + e.length / 2;
              this.options.x = e.y - e.length / 2 + 1;
            } else if (e.dir === "WE") {
              i = e.length;
              this.options.y = e.x;
              this.options.x = e.y + e.length / 2;
            }
            d.__super__.constructor.call(this, b, this.options.x, this.options.y);
            this.game.add.existing(this);
            this.game.layers.liquids.addChild(this);
            this.game.physics.box2d.enable(this);
            this.body.clearFixtures();
            this.body.mass = 0;
            this.body.data.SetPosition(new box2d.b2Vec2(-this.options.x, -this.options.y));
            if (e.dir === "SW") {
              f = Math.PI / 4;
            } else if (e.dir === "SE") {
              f = -Math.PI / 4;
            } else if (e.dir === "WE") {
              f = 0;
            }
            this.body.data.SetAngle(f);
            k = new box2d.b2PolygonShape();
            m = [];
            l = i - 0.1;
            j = 0.4;
            m.push(new box2d.b2Vec2(-l / 2 + 0, 0.01));
            m.push(new box2d.b2Vec2(l / 2 - 0, 0.01));
            m.push(new box2d.b2Vec2(l / 2 - 0.3, 0 - j + 0.01));
            m.push(new box2d.b2Vec2(-l / 2 + 0.3, 0 - j + 0.01));
            k.Set(m);
            h = new box2d.b2FixtureDef();
            h.shape = k;
            h.filter.categoryBits = 1;
            h.filter.maskBits = 16;
            h.friction = 1;
            h.userData = {
              type: "ice"
            };
            g = this.iceFixture = this.body.data.CreateFixture(h);
            g.id = this.body.world.getNextFixtureId();
            this.body.setFixtureContactCallback(this.iceFixture, function (a) {
              return function (a, b, c, d, e, f) {
                var g;
                if (b.sprite.character != null && d.m_userData === "feet" || a.sprite.character != null && c.m_userData === "feet") {
                  g = b.sprite.character || a.sprite.character;
                  if (e) {
                    g.snowCount ||= 0;
                    g.snowCount += 1;
                  } else {
                    g.snowCount ||= 0;
                    g.snowCount -= 1;
                  }
                  return g.setOnIce(g.snowCount !== 0);
                }
              };
            }(this));
            this.createSnowGraphics();
            return this;
          }
          b(d, c);
          d.prototype.createSnowGraphics = function () {
            var a;
            var b;
            var c;
            var d;
            var e;
            var f;
            var g;
            var h;
            d = [];
            e = a = 0;
            c = this.options.data.length - 1;
            for (; c >= 0 ? a <= c : a >= c; e = c >= 0 ? ++a : --a) {
              b = 1;
              if (this.options.data.dir === "SW") {
                g = this.game.physics.box2d.mpx(1) * (this.options.x - this.options.data.length / 2 + e * b);
                h = this.game.physics.box2d.mpx(1) * (this.options.y - this.options.data.length / 2 + e * b);
                f = "SnowSlope0000";
              } else if (this.options.data.dir === "SE") {
                g = this.game.physics.box2d.mpx(1) * (this.options.x + this.options.data.length / 2 - 1 - e * b);
                h = this.game.physics.box2d.mpx(1) * (this.options.y - this.options.data.length / 2 + e * b);
                f = "SnowSlope0001";
              } else if (this.options.data.dir === "WE") {
                g = this.game.physics.box2d.mpx(1) * (this.options.x - this.options.data.length / 2 + e);
                h = this.game.physics.box2d.mpx(1) * this.options.y;
                f = "SnowFlat0000";
              }
              d.push(this.drawTile(g, h, f));
            }
            return d;
          };
          d.prototype.drawTile = function (a, b, c, d) {
            var e;
            var f;
            e = this.game.cache.getFrameByName("GroundAssets", c);
            f = this.game.cache.getImage("GroundAssets");
            a = a - (e.width - 32) / 2 + 32;
            b = b - (e.height - 32) / 2 + 32;
            return this.ground.bmd.ctx.drawImage(f, e.x, e.y, e.width, e.height, a, b, e.width, e.height);
          };
          return d;
        }(Phaser.Sprite);
      });