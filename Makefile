js/bundle.js: package.json js/site.js
	browserify js/site.js > js/bundle.js.tmp
	mv js/bundle.js.tmp js/bundle.js
