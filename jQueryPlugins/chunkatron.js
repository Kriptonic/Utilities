(function() {

	/**
	 * The Chunkatron's purpose is to download lots of data via seperate calls. When reports take a long time to load,
	 * it is better to pass the Chunkatron the Ids for the object you want in the report and have it download them
	 * in batches for compilation on the client side.
	 *
	 * @author Christopher Sharman (Kriptonic on GitHub)
	 * @param overrides
	 * @returns {$.fn}
	 */
	$.fn.chunkatron = function(overrides) {

		// Default options to be overrided.
		var defaultOptions = {

			/**
			 * The location to send Ajax requests to with our chunk data.
			 */
			url: null,

			/**
			 * An array containing an array of Ids to be sent for processing at the @see url (usually injected via templates).
			 */
			chunks: null,

			/**
			 * The Url to download the chunks from if not provided using the @see chunks variable above.
			 */
			chunksUrl: null,

			/**
			 * Fired when an Ajax call returns a success response.
			 */
			onChunkSuccess: null,

			/**
			 * Fired when a chunk has been downloaded, a call will be made for every object in the chunk.
			 */
			onObjectDownloaded: null,

			/**
			 * Fired when an Ajax request comes to an end (after onChunkSuccess/onChunkError).
			 */
			onChunkComplete: null,

			/**
			 * Fired when the Ajax request returns an error.
			 */
			onChunkError: null,

			/**
			 * Fired when all retries have been made with a chunk but it errored every time.
			 */
			onChunkGiveUp: null,

			/**
			 * Fired when no more work remains.
			 */
			onFinished: null,

			/**
			 * Fired when the initial chunk list is downloaded from the external source (@see chunksUrl)
			 */
			onChunksUrlComplete: null,

			/**
			 * Fired immediately before an Ajax call is sent to the provided url.
			 */
			onChunkDownloadStart: null,

			/**
			 * Display console.log information about what is happening, useful for debugging.
			 */
			verbose: false,

			/**
			 * The dataType to use for Ajax requests.
			 */
			dataType: 'json',

			/**
			 * The number of attempts that should be made to download a chunk that errors.
			 */
			maxDownloadRetries: 3,

			/**
			 * The maximum number of concurrent requests that the Chunkatron should make at any one time.
			 */
			concurrentDownloadsMax: 10
		};

		// Load in the default settings and override them with the ones provided.
		this.settings = $.extend(defaultOptions, overrides);

		/**
		 * The number of simultaneous downloads we have going.
		 * @type {number}
		 */
		this.concurrentDownloads = 0;

		/**
		 * We store the chunks that have failed to download and the number of retry attempts here.
		 * @type {Array}
		 */
		this.chunkFailures = [];

		/**
		 * Ensure the required settings have been provided.
		 */
		this.verifySettings = function() {
			// We need chunk data, this can be provided directly or by a url.
			if (this.settings.chunks == null && this.settings.chunksUrl == null) {
				throw new Error('Either the chunks or the chunksUrl must be provided');
			}
			// It is not our job to process the data returned, we need to pass this back to the user using these callbacks.
			if (typeof this.settings.onChunkSuccess != 'function' && typeof this.settings.onObjectDownloaded != 'function') {
				throw new Error('A callback for \'onChunkSuccess\' or \'onObjectDownloaded\' needs to be provided');
			}
		};

		/**
		 * Download a chunk of data.
		 */
		this.downloadChunk = function() {

			if (this.settings.verbose) console.log('Chunk download starting... There are ' + this.chunks.length + ' chunk(s) remaining.');

			// We wish to avoid having too many downloads running at once.
			if (this.concurrentDownloads >= this.settings.concurrentDownloadsMax) {
				return;
			}

			// Grab the chunk at the front of the list.
			var currentChunk = this.chunks.shift();

			// If we don't have a chunk at this point, it's because none are left and all have been dealt with.
			if (currentChunk == null) {
				if (this.settings.verbose) console.log('We are finished!');
				this.callback(this.settings.onFinished);
				return;
			}

			// Store a reference to the first item, we wish to stop making download attempts if it keeps failing.
			if (this.chunkFailures[currentChunk[0]] > this.settings.maxDownloadRetries) {
				// Pass the failed chunk back for analysis.
				this.callback(this.settings.onChunkGiveUp, currentChunk);
				// Start another.
				this.downloadChunk();
				if (this.settings.verbose) console.log('Given up on a chunk! Failed to download after', this.settings.maxDownloadRetries, 'attempt(s)');
				return;
			}

			this.callback(this.settings.onChunkDownloadStart);

			// Update the number of concurrent downloads.
			this.concurrentDownloads++;

			// 'this' from within the $.ajax callbacks doens't refer to the current object anymore, var self will get around this.
			var self = this;

			// Make the request for the chunk.
			$.ajax({
				url: this.settings.url,
				method: 'POST',
				dataType: this.settings.dataType,
				data: {
					chunk: currentChunk
				},
				// Called when the request was successful.
				success: function(data, status, xhr) {
					// Send the data we recieved to the user-defined callback (it is not our job to process it).
					self.callback(self.settings.onChunkSuccess, data);
					// Fire the objectDownloaded callback passing each object we got in the chunk.
					if (typeof self.settings.onObjectDownloaded == 'function') {
						for (var i in data) {
							self.callback(self.settings.onObjectDownloaded, data[i]);
						}
					}
				},
				// Called when there was an error - Usually going to be 404 or 504
				error: function(xhr, status, error) {
					// Keep a record of this chunk failing.
					var chunkIdentifier = currentChunk[0];
					self.chunkFailures[chunkIdentifier] = (self.chunkFailures[chunkIdentifier] == null) ? 1 : self.chunkFailures[chunkIdentifier] + 1;
					// Add the chunk back onto the stack, we can try again later.
					self.chunks.push(currentChunk);
					self.callback(self.settings.onChunkError, error);
				},
				// This function is ran after success and error.
				complete: function(xhr, status) {
					// This download is finished (success or error, doesn't matter).
					self.concurrentDownloads--;
					self.callback(self.settings.onChunkComplete);
					// Start a new download.
					self.downloadChunk();
				}
			});

		};

		/**
		 * Used to fire callbacks/events that occour during the downloading process.
		 * @param callback
		 */
		this.callback = function(callback, params) {
			if (typeof callback == 'function') {
				if (params) {
					callback(params);
				} else {
					callback();
				}
			} else if (callback != null) {
				throw new Error('The callback must be a function (or null if you don\'t want one)');
			}
		};

		// Check to ensure we have all the settings we need to operate.
		this.verifySettings();

		/**
		 * Start the downloading process.
		 * We wrap this inside of a function so that it can be called after the chunks have been downloaded from
		 * the provided URL if that was the route to be taken.
		 */
		this.start = function() {
			// Set the easier to access variables.
			this.chunks = this.settings.chunks;

			// Start the downloading process by sending as many requests as the limit allows for.
			for (var i = 0; i < this.settings.concurrentDownloadsMax; i++) {
				this.downloadChunk();
			}
		};

		// If a chunksUrl was provided, download the chunks.
		if (this.settings.chunks == null && this.settings.chunksUrl != null) {
			var self = this;
			$.ajax({
				url: this.settings.chunksUrl,
				dataType: this.settings.dataType,
				success: function(data) {
					self.settings.chunks = data;
					self.callback(self.settings.onChunksUrlComplete, data.length);
					self.start();
				},
				error: function() {
					throw new Error('We were unable to download the chunks from the url provided: ' + self.settings.chunksUrl);
				}
			});
		} else {
			this.start();
		}

		// Chaining.
		return this;
	};

})();
