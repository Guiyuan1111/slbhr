				(this.melt = a(this.melt, this)),
						(this.freeze = a(this.freeze, this)),
						(this.initialFreeze = a(this.initialFreeze, this)),
						(this.shouldMelt = a(this.shouldMelt, this)),
						(this.shouldFreeze = a(this.shouldFreeze, this)),
						(this.update = a(this.update, this)),
						(this.createIceGraphics = a(this.createIceGraphics, this)),
						(this.createLiquidGraphics = a(this.createLiquidGraphics, this));
					var g, h, i, j, k, l;
					return (
						55 === f.type && ((f.type = 5), (f.startFrozen = !0)),
						(this.options = f),
						(this.options.x = c),
						(this.options.y = e),
						d.__super__.constructor.call(this, b, c, e, "GroundAssets", "_default0000"),
						this.game.layers.liquids.addChild(this),
						this.game.physics.box2d.enable(this),
						this.body.clearFixtures(),
						(this.body.mass = 0),
						this.body.data.SetPosition(new box2d.b2Vec2(-c, -e)),
						(j = new box2d.b2PolygonShape()),
						(l = []),
						(k = f.width),
						(i = 1),
						l.push(new box2d.b2Vec2(0, -0.15)),
						l.push(new box2d.b2Vec2(-k, -0.15)),
						l.push(new box2d.b2Vec2(-k, -i / 2)),
						l.push(new box2d.b2Vec2(0, -i / 2)),
						j.Set(l),
						(h = new box2d.b2FixtureDef()),
						(h.shape = j),
						(h.filter.categoryBits = 1),
						(h.filter.maskBits = 61695),
						(h.friction = 0.7),
						(h.isSensor = !0),
						(h.userData = { type: "liquid", liquidType: f.type, lightProperties: { type: "normal", sensor: !0 } }),
						(g = this.sensorFixture = this.body.data.CreateFixture(h)),
						(g.id = this.body.world.getNextFixtureId()),
						(j = new box2d.b2PolygonShape()),
						(l = []),
						(k = f.width),
						(i = 1),
						l.push(new box2d.b2Vec2(0, 0)),
						l.push(new box2d.b2Vec2(-k, 0)),
						l.push(new box2d.b2Vec2(-k, -i / 2)),
						l.push(new box2d.b2Vec2(0, -i / 2)),
						j.Set(l),
						(h = new box2d.b2FixtureDef()),
						(h.shape = j),
						(h.filter.categoryBits = 1),
						(h.filter.maskBits = 0),
						(h.friction = 0),
						(h.userData = { type: "ice", liquidType: f.type, lightProperties: { type: "transparent" } }),
						(g = this.iceFixture = this.body.data.CreateFixture(h)),
						(g.id = this.body.world.getNextFixtureId()),
						this.body.setFixtureContactCallback(
							this.iceFixture,
							(function (a) {
								return function (a, b, c, d, e, f) {
									var g;
									if (null != b.sprite.character || null != a.sprite.character)
										return (
											(g = b.sprite.character || a.sprite.character), e ? (g.snowCount || (g.snowCount = 0), (g.snowCount += 1)) : (g.snowCount || (g.snowCount = 0), (g.snowCount -= 1)), g.setOnIce(0 !== g.snowCount)
										);
								};
							})(this)
						),
						(j = new box2d.b2PolygonShape()),
						(l = []),
						(k = f.width),
						(i = 0.18),
						l.push(new box2d.b2Vec2(0, -i)),
						l.push(new box2d.b2Vec2(-k, -i)),
						l.push(new box2d.b2Vec2(-k, -1)),
						l.push(new box2d.b2Vec2(0, -1)),
						j.Set(l),
						(h = new box2d.b2FixtureDef()),
						(h.shape = j),
						(h.filter.categoryBits = 1),
						(h.filter.maskBits = 4369),
						(h.friction = 0.7),
						(h.isSensor = !0),
						(h.userData = { type: "liquid_death", liquidType: f.type, lightProperties: { type: "transparent" } }),
						(g = this.killFixture = this.body.data.CreateFixture(h)),
						(g.id = this.body.world.getNextFixtureId()),
						(this.liquidGraphics = this.game.make.group()),
						(this.liquidGraphics.position.y = 2),
						this.createLiquidGraphics(),
						this.addChild(this.liquidGraphics),
						5 === f.type && ((this.iceGraphics = this.game.make.group()), (this.iceGraphics.position.y = 4), this.createIceGraphics(), this.addChild(this.iceGraphics), (this.iceGraphics.visible = !1)),
						(this.nearBodies = {}),
						(this.frozenBodies = {}),
						this.body.setFixtureContactCallback(
							this.sensorFixture,
							(function (a) {
								return function (b, c, d, e, f, g) {
									var h;
									return f || null == a.nearBodies[c.id] ? (f && null == a.nearBodies[c.id] ? ((h = { body: c }), (a.nearBodies[c.id] = h)) : void 0) : delete a.nearBodies[c.id];
								};
							})(this),
							this
						),
						f.startFrozen && _.delay(this.initialFreeze, 10),
						this
					);
				}
				return (
					b(d, c),
					(d.prototype.createLiquidGraphics = function () {
						var a, b, c, d, e, f, g;
						if (
							(5 === this.options.type ? (a = "WaterBox") : 6 === this.options.type ? (a = "FireBox") : 7 === this.options.type && (a = "GreenBox"),
							(d = this.game.make.sprite(0, 0, "GroundAssets")),
							d.anchor.set(0.5),
							d.animations.add("loop", Phaser.Animation.generateFrameNames(a + "Left", 0, 14, "", 4), 30, !0),
							this.liquidGraphics.addChild(d),
							(d.x = this.body.world.mpx(0.5)),
							(d.y = this.body.world.mpx(0.5)),
							d.animations.play("loop"),
							this.options.width > 2)
						)
							for (b = c = 1, f = this.options.width - 2; 1 <= f ? c <= f : c >= f; b = 1 <= f ? ++c : --c)
								(e = this.game.make.sprite(0, 0, "GroundAssets")),
									e.anchor.set(0.5),
									e.animations.add("loop", Phaser.Animation.generateFrameNames(a, 0, 14, "", 4), 30, !0),
									this.liquidGraphics.addChild(e),
									(e.x = this.body.world.mpx(b + 0.5)),
									(e.y = this.body.world.mpx(0.5)),
									e.animations.play("loop");
						return (
							(g = this.game.make.sprite(0, 0, "GroundAssets")),
							g.anchor.set(0.5),
							g.animations.add("loop", Phaser.Animation.generateFrameNames(a + "Right", 0, 14, "", 4), 30, !0),
							this.liquidGraphics.addChild(g),
							(g.x = this.body.world.mpx(this.options.width - 0.5)),
							(g.y = this.body.world.mpx(0.5)),
							g.animations.play("loop")
						);
					}),
					(d.prototype.createIceGraphics = function () {
						var a, b, c, d, e, f, g;
						for (
							a = "IceBox",
								d = this.game.make.sprite(0, 0, "GroundAssets", a + "Left0000"),
								d.anchor.set(0.5),
								this.iceGraphics.addChild(d),
								d.x = this.body.world.mpx(0.5),
								d.y = this.body.world.mpx(0.5),
								b = c = 1,
								f = this.options.width - 2;
							1 <= f ? c <= f : c >= f;
							b = 1 <= f ? ++c : --c
						)
							(e = this.game.make.sprite(0, 0, "GroundAssets", a + "0000")), e.anchor.set(0.5), this.iceGraphics.addChild(e), (e.x = this.body.world.mpx(b + 0.5)), (e.y = this.body.world.mpx(0.5));
						return (g = this.game.make.sprite(0, 0, "GroundAssets", a + "Right0000")), g.anchor.set(0.5), this.iceGraphics.addChild(g), (g.x = this.body.world.mpx(this.options.width - 0.5)), (g.y = this.body.world.mpx(0.5));
					}),
					(d.prototype.update = function () {
						if (!this.game.physics.box2d.paused) {
							if (!this.ready) return void (this.ready = !0);
							if (null != this.sensorFixture.m_userData.lightProperties.iluminated) {
								if ("blue" === this.sensorFixture.m_userData.lightProperties.iluminated && 5 === this.options.type) return this.shouldFreeze();
								if ("red" === this.sensorFixture.m_userData.lightProperties.iluminated && 5 === this.options.type) return this.shouldMelt();
							}
						}
					}),
					(d.prototype.shouldFreeze = function () {
						if (!this.frozen) return this.freeze(), this.game.level.sounds.freeze.play();
					}),
					(d.prototype.shouldMelt = function () {
						if (this.f