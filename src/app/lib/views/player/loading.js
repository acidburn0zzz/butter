(function (App) {
	'use strict';

	var Loading = Backbone.Marionette.ItemView.extend({
		template: '#loading-tpl',
		className: 'app-overlay',
		extPlayerStatusUpdater: null,

		ui: {
			stateTextDownload: '.text_download',
			progressTextDownload: '.value_download',

			stateTextPeers: '.text_peers',
			progressTextPeers: '.value_peers',

			stateTextSeeds: '.text_seeds',
			progressTextSeeds: '.value_seeds',

			seedStatus: '.seed_status',
			bufferPercent: '.buffer_percent',

			downloadSpeed: '.download_speed',
			uploadSpeed: '.upload_speed',
			progressbar: '#loadingbar-contents',

			title: '.title',
			player: '.player-name',
			streaming: '.external-play',
			controls: '.player-controls',
			cancel_button: '.cancel-button',

			playingbarBox: '.playing-progressbar',
			playingbar: '#playingbar-contents'
		},

		events: {
			'click .cancel-button': 'cancelStreaming',
			'click .pause': 'pauseStreaming',
			'click .stop': 'stopStreaming',
			'click .play': 'resumeStreaming',
			'click .forward': 'forwardStreaming',
			'click .backward': 'backwardStreaming',
			'click .playing-progressbar': 'seekStreaming'
		},

		initialize: function () {
			var _this = this;

			//If a child was removed from above this view
			App.vent.on('viewstack:pop', function () {
				if (_.last(App.ViewStack) === _this.className) {
					_this.initKeyboardShortcuts();
				}
			});

			//If a child was added above this view
			App.vent.on('viewstack:push', function () {
				if (_.last(App.ViewStack) !== _this.className) {
					_this.unbindKeyboardShortcuts();
				}
			});

			win.info('Loading torrent');
			this.listenTo(this.model, 'change:state', this.onStateUpdate);
		},

		initKeyboardShortcuts: function () {
			var _this = this;
			Mousetrap.bind(['esc', 'backspace'], function (e) {
				_this.cancelStreaming();
			});
		},

		unbindKeyboardShortcuts: function () {
			Mousetrap.unbind(['esc', 'backspace']);
		},

		onShow: function () {
			$('.filter-bar').hide();
			$('#header').addClass('header-shadow');

			this.initKeyboardShortcuts();
		},
		onStateUpdate: function () {
			var self = this;
			var state = this.model.get('state');
			var streamInfo = this.model.get('streamInfo');
			win.info('Loading torrent:', state);

			this.ui.stateTextDownload.text(i18n.__(state));

			if (state === 'downloading') {
				this.listenTo(this.model.get('streamInfo'), 'change:downloaded', this.onProgressUpdate);
			}

			if (state === 'playingExternally') {
				this.ui.stateTextDownload.hide();
				if (streamInfo.get('player') && streamInfo.get('player').get('type') === 'chromecast') {
					this.ui.controls.css('visibility', 'visible');
					this.ui.playingbarBox.css('visibility', 'visible');
					this.ui.playingbar.css('width', '0%');
					this.ui.progressbar.hide();
					this.ui.cancel_button.hide();

					// Update gui on status update.
					// uses listenTo so event is unsubscribed automatically when loading view closes.
					this.listenTo(App.vent, 'device:status', this.onDeviceStatus);
				}
			}
		},

		onProgressUpdate: function () {

			// TODO: Translate peers / seeds in the template
			this.ui.seedStatus.css('visibility', 'visible');
			var streamInfo = this.model.get('streamInfo');
			var downloaded = streamInfo.get('downloaded') / (1024 * 1024);
			this.ui.progressTextDownload.text(downloaded.toFixed(2) + ' Mb');

			this.ui.progressTextPeers.text(streamInfo.get('active_peers'));
			this.ui.progressTextSeeds.text(streamInfo.get('total_peers'));
			this.ui.bufferPercent.text(streamInfo.get('buffer_percent').toFixed() + '%');

			this.ui.downloadSpeed.text(streamInfo.get('downloadSpeed'));
			this.ui.uploadSpeed.text(streamInfo.get('uploadSpeed'));
			this.ui.progressbar.css('width', streamInfo.get('buffer_percent').toFixed() + '%');

			if (streamInfo.get('title') !== '') {
				this.ui.title.text(streamInfo.get('title'));
			}
			if (streamInfo.get('player') && streamInfo.get('player').get('type') !== 'local') {
				this.ui.player.text(streamInfo.get('player').get('name'));
				this.ui.streaming.css('visibility', 'visible');
			}
		},

		onDeviceStatus: function (status) {
			//console.log('device status: ', status);
			if (status.media !== undefined && status.media.duration !== undefined) {
				// Update playingbar width
				var playedPercent = status.currentTime / status.media.duration * 100;
				this.ui.playingbar.css('width', playedPercent.toFixed(1) + '%');
				console.log('ExternalStream: %s: %ss / %ss (%s%)', status.playerState,
					status.currentTime.toFixed(1), status.media.duration.toFixed(), playedPercent.toFixed(1));
			}
			if (!this.extPlayerStatusUpdater && status.playerState === 'PLAYING') {
				// First PLAYING state. Start requesting device status update every 5 sec
				this.extPlayerStatusUpdater = setInterval(function () {
					App.vent.trigger('device:status:update');
				}, 5000);
			}
			if (this.extPlayerStatusUpdater && status.playerState === 'IDLE') {
				// Media started streaming and is now finished playing
				this.cancelStreaming();
			}
		},

		cancelStreaming: function () {

			// call stop if we play externally
			if (this.model.get('state') === 'playingExternally') {
				if (this.extPlayerStatusUpdater) {
					clearInterval(this.extPlayerStatusUpdater);
				}
				console.log('Stopping external device');
				App.vent.trigger('device:stop');
			}

			console.log('Closing loading view');
			App.vent.trigger('stream:stop');
			App.vent.trigger('player:close');
			App.vent.trigger('torrentcache:stop');
		},

		pauseStreaming: function () {
			App.vent.trigger('device:pause');
			$('.pause').removeClass('fa-pause').removeClass('pause').addClass('fa-play').addClass('play');
		},

		resumeStreaming: function () {
			console.log('clicked play');
			App.vent.trigger('device:unpause');
			$('.play').removeClass('fa-play').removeClass('play').addClass('fa-pause').addClass('pause');
		},

		stopStreaming: function () {
			this.cancelStreaming();
		},

		forwardStreaming: function () {
			console.log('clicked forward');
			App.vent.trigger('device:forward');
		},

		backwardStreaming: function () {
			console.log('clicked backward');
			App.vent.trigger('device:backward');
		},

		seekStreaming: function (e) {
			var percentClicked = e.offsetX / e.currentTarget.clientWidth * 100;
			console.log('clicked seek (%s%)', percentClicked.toFixed(2));
			App.vent.trigger('device:seekPercentage', percentClicked);
		},

		onClose: function () {
			$('.filter-bar').show();
			$('#header').removeClass('header-shadow');
			Mousetrap.bind('esc', function (e) {
				App.vent.trigger('show:closeDetail');
				App.vent.trigger('movie:closeDetail');
			});
		}
	});

	App.View.Loading = Loading;
})(window.App);
