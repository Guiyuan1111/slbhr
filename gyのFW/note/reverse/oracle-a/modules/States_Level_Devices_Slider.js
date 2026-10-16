// 模块: States/Level/Devices/Slider  (init.beautified.js L58986-L59078)
      define("States/Level/Devices/Slider", ["./Device"], function (c) {
        "use strict";

        var d;
        return d = d = function (c) {
          function d(b, c) {
            this.checkState = a(this.checkState, this);
            this.sounds = a(this.sounds, this);
            var e;
            var f;
            var g;
            var h;
            var i;
            var j;
            var k;
            var l;
            var m;
            var n;
            var o;
            var p;
            var q;
            d.__super__.constructor.call(this, b, c);
            p += this.game.physics.box2d.mpx(1);
            q -= this.game.physics.box2d.mpx(1);
            o = this.options.polyline[1][0] - this.options.polyline[0][0];
            this._width = o;
            m = {
              x: this.options.x + o / 2,
              y: this.options.y
            };
            g = this.game.make.sprite(m.x, m.y, "MechAssets", "_default0000");
            this.game.physics.box2d.enable(g);
            h = this.game.make.sprite(0, 0, "MechAssets", "SliderDot0000");
            h.anchor.set(0.5);
            g.addChild(h);
            i = this.game.make.sprite(0, 0, "MechAssets", "slider_light_off0000");
            i.anchor.set(0.5);
            g.addChild(i);
            this.game.layers.overChars.addChild(g);
            this.lights.push(i);
            n = this.game.make.sprite(m.x, m.y, "MechAssets", "SliderTrack0000");
            n.anchor.set(0.5);
            n.width = o;
            this.game.layers.underGround.addChild(n);
            g.body.clearFixtures();
            f = new box2d.b2CircleShape(0.3);
            f.m_p.SetXY(0, 0);
            k = new box2d.b2FixtureDef();
            k.shape = f;
            k.friction = 0;
            j = g.body.data.CreateFixture(k);
            e = new box2d.b2Vec2(-1, 0);
            l = new box2d.b2PrismaticJointDef();
            l.Initialize(g.body.data, this.game.level.groundBody, g.body.data.GetWorldCenter(), e);
            l.upperTranslation = -this.pxm(o / 2);
            l.lowerTranslation = this.pxm(o / 2);
            l.enableLimit = true;
            l.motorSpeed = 0;
            l.maxMotorForce = 20;
            l.enableMotor = true;
            this.joint = this.game.physics.box2d.world.CreateJoint(l);
            this.jointTranslation = this.joint.GetJointTranslation();
            this.translationWidth = Math.abs(l.upperTranslation - l.lowerTranslation);
            g.body.data.SetLinearDamping(1);
            this.signal = new Phaser.Signal();
            this.registerDevice();
            return this;
          }
          b(d, c);
          d.prototype.options = {
            properties: {
              group: 0
            }
          };
          d.prototype.sounds = function () {
            return "slider";
          };
          d.prototype.checkState = function () {
            if (this.joint.GetJointTranslation() !== this.jointTranslation) {
              (function () {
                var times = Math.abs(Math.floor(this.jointTranslation / this.translationWidth * 27) - Math.floor(this.joint.GetJointTranslation() / this.translationWidth * 27));
                for (var i = 0; i < times; i++) {
                  this.sound = this.game.level.sounds.slider.context != null && this.game.level.sounds.slider.play();
                }
              }).apply(this);
              this.jointTranslation = this.joint.GetJointTranslation();
              this.state = Math.PI * this.joint.GetJointTranslation() * (this.options.properties.max || 1) / this.pxm(-this._width);
              return this.signal.dispatch(this);
            }
          };
          return d;
        }(c);
      });