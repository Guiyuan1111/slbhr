// 模块: States/Level/Devices/Window  (init.beautified.js L59661-L59745)
      define("States/Level/Devices/Window", ["./Device"], function (b) {
        "use strict";

        var c;
        return c = c = function (b) {
          function c(a, b) {
            var d;
            var e;
            var f;
            var g;
            var h;
            var i;
            var j;
            var k;
            if (b.width < b.height) {
              k = b.width;
              b.width = b.height;
              b.height = k;
              b.x = b.x + b.height / 2;
              b.y = b.y + b.width / 2;
              b.rotation = -90;
            } else {
              b.x = b.x + b.width / 2;
              b.y = b.y + b.height / 2;
            }
            c.__super__.constructor.call(this, a, b);
            this.sprite = this.game.make.sprite(this.options.x, this.options.y, "MechAssets", "_default0000");
            this.game.physics.box2d.enable(this.sprite);
            this.game.layers.overGround.addChild(this.sprite);
            this.body = this.sprite.body;
            this.body.clearFixtures();
            this.body.data.SetAngle(this.options.rotation);
            this.body.static = true;
            i = new box2d.b2PolygonShape();
            i.SetAsOrientedBox(this.options.width / 2, this.options.height / 2, new box2d.b2Vec2(0, 0), 0);
            g = new box2d.b2FixtureDef();
            g.shape = i;
            g.friction = 0.7;
            g.restitution = 0;
            g.density = 0;
            g.userData = g.userData = {
              lightProperties: {
                type: "transparent"
              }
            };
            g.filter.categoryBits = 1;
            g.filter.maskBits = 61695;
            f = this.body.data.CreateFixture(g);
            f.id = this.body.world.getNextFixtureId();
            d = new box2d.b2Vec2(this.options.properties.dx, this.options.properties.dy);
            this.state = 0;
            this.registerDevice();
            h = this.game.make.sprite(0, 0, "MechAssets", "WindowLeft0000");
            h.anchor.set(0.5);
            this.sprite.addChild(h);
            h.x = this.mpx(this.options.width / 2 - 0.5);
            h.y = this.mpx(this.options.height / 2 - 0.5);
            j = this.game.make.sprite(0, 0, "MechAssets", "WindowRight0000");
            j.anchor.set(0.5);
            this.sprite.addChild(j);
            j.x = -this.mpx(this.options.width / 2 - 0.5);
            j.y = this.mpx(this.options.height / 2 - 0.5);
            e = this.game.make.sprite(0, 0, "MechAssets", "WindowCenter0000");
            e.anchor.set(0.5);
            this.sprite.addChild(e);
            e.x = 0;
            e.y = 0;
            e.scale.x = (this.options.width - 2) / 3;
            this.sprite.scale.x = 1.05;
            this.sprite.scale.y = 1.05;
          }
          a(c, b);
          c.prototype.options = {
            atlasName: null,
            frameName: null,
            lightAtlas: "MechAssets",
            properties: {
              group: 0,
              dx: 4,
              dy: 0
            }
          };
          return c;
        }(b);
      });