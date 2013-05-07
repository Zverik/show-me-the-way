var osmStream = require('osm-stream'),
    reqwest = require('reqwest'),
    moment = require('moment'),
    _ = require('underscore');

var bboxString = ["42.5", "27.58", "78.0", "180.0"];
var excludeChinaString = ["42.0", "49.46", "49.26", "130.87"];
var excludeJapanString = ["42.0", "138.83", "45.65", "145.35"];
var ignore = ['bot-mode'];
var BING_KEY = 'Arzdiw4nlOJzRwOz__qailc8NiR31Tt51dN2D7cm57NrnceZnCpgOkmJhNpGoppU';

var map = L.map('map', {
    zoomControl: false,
    dragging: false,
    scrollWheelZoom: false,
    doubleClickZoom: false,
    boxZoom: false
}).setView([55.75, 37.61], 14);

var overview_map = L.map('overview_map', {
    zoomControl: false,
    dragging: false,
    touchZoom: false,
    scrollWheelZoom: false,
    doubleClickZoom: false,
    boxZoom: false
}).setView([55.75, 37.61], 1);

var bing = new L.BingLayer(BING_KEY, 'Aerial').addTo(map);

var osm = new L.TileLayer('http://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    minZoom: 5,
    maxZoom: 8,
    attribution: '<a href="http://openstreetmap.org/copyright">Карта &copy; OpenStreetMap</a>'
}).addTo(overview_map);

var lineGroup = L.featureGroup().addTo(map);

var changeset_info = document.getElementById('changeset_info');
var changeset_tmpl = _.template(document.getElementById('changeset-template').innerHTML);
var queue = [];

// Remove Leaflet shoutouts
map.attributionControl.setPrefix('');
overview_map.attributionControl.setPrefix('');

var bboxChina = new L.LatLngBounds(
        new L.LatLng(+excludeChinaString[0], +excludeChinaString[1]),
        new L.LatLng(+excludeChinaString[2], +excludeChinaString[3]));
var bboxJapan = new L.LatLngBounds(
        new L.LatLng(+excludeJapanString[0], +excludeJapanString[1]),
        new L.LatLng(+excludeJapanString[2], +excludeJapanString[3]));
var bbox = new L.LatLngBounds(
        new L.LatLng(+bboxString[0], +bboxString[1]),
        new L.LatLng(+bboxString[2], +bboxString[3]));

changeset_info.innerHTML = '<div class="loading">загружаю...</div>';

function showLocation(ll) {
    var nominatim_tmpl = 'http://nominatim.openstreetmap.org/reverse?format=json' +
        '&lat={lat}&lon={lon}&zoom=5';
    reqwest({
        url: nominatim_tmpl.replace('{lat}', ll.lat).replace('{lon}', ll.lng),
        type: 'json'
    }, function(resp) {
        document.getElementById('reverse-location').innerHTML =
            '' + resp.display_name + '';
    });
}

function showComment(id) {
    var changeset_url_tmpl = 'http://www.openstreetmap.org/api/0.6/changeset/{id}';
    reqwest({
        url: changeset_url_tmpl
            .replace('{id}', id),
        type: 'xml'
    }, function(resp) {
        var tags = resp.getElementsByTagName('tag');
        var comment = '',
            editor = '';
        for (var i = 0; i < tags.length; i++) {
            if (tags[i].getAttribute('k') == 'comment') {
                comment = tags[i].getAttribute('v').substring(0, 60);
            }
            if (tags[i].getAttribute('k') == 'created_by') {
                editor = tags[i].getAttribute('v').substring(0, 50);
            }
        }
        document.getElementById('comment').innerHTML = comment + ' в ' + editor;
    });
}

var runSpeed = 3000;

// The number of changes to show per minute
osmStream.runFn(function(err, data) {
    queue = _.filter(data, function(f) {
        if (!(f.feature && f.feature.type === 'way')) return false;
        var featureBBox = new L.LatLngBounds(
                new L.LatLng(f.feature.bounds[0], f.feature.bounds[1]),
                new L.LatLng(f.feature.bounds[2], f.feature.bounds[3]));
        return (bbox.intersects(featureBBox) && !bboxChina.contains(featureBBox) && !bboxJapan.contains(featureBBox)) &&
            f.feature.linestring &&
            moment(f.meta.timestamp).format("MMM Do YY") === moment().format("MMM Do YY") &&
            ignore.indexOf(f.meta.user) === -1 &&
            f.feature.linestring.length > 4;
    }).sort(function(a, b) {
        return (+new Date(a.meta.tilestamp)) -
            (+new Date(a.meta.tilestamp));
    });
    // if (queue.length > 2000) queue = queue.slice(0, 2000);
});

function doDrawWay() {
    document.getElementById('queuesize').innerHTML = queue.length;
    if (queue.length) {
        drawWay(queue.pop(), function() {
            doDrawWay();
        });
    } else {
        window.setTimeout(doDrawWay, runSpeed);
    }
}

function pruneLines() {
    var mb = map.getBounds();
    lineGroup.eachLayer(function(l) {
        if (!mb.intersects(l.getBounds())) {
            lineGroup.removeLayer(l);
        } else {
            l.setStyle({ opacity: 0.5 });
        }
    });
}

function setTagText(change) {
    var showTags = ['building', 'natural', 'leisure', 'waterway',
        'barrier', 'landuse', 'highway', 'power'];
    for (var i = 0; i < showTags.length; i++) {
        if (change.feature.tags[showTags[i]]) {
            change.tagtext = showTags[i] + '=' + change.feature.tags[showTags[i]];
            return change;
        }
    }
    change.tagtext = 'линию';
    return change;
}

function drawWay(change, cb) {
    pruneLines();

    var way = change.feature;

    // Zoom to the area in question
    var bounds = new L.LatLngBounds(
        new L.LatLng(way.bounds[2], way.bounds[3]),
        new L.LatLng(way.bounds[0], way.bounds[1]));

    showLocation(bounds.getCenter());
    showComment(way.changeset);

    var timedate = moment(change.meta.timestamp);
    change.timetext = timedate.fromNow();

    map.fitBounds(bounds);
    overview_map.panTo(bounds.getCenter());
    changeset_info.innerHTML = changeset_tmpl({ change: setTagText(change) });

    var color = { 'create': '#B7FF00', 'modify': '#FF00EA', 'delete': '#FF0000' }[change.type];
    if (change.feature.tags.building || change.feature.tags.area) {
        newLine = L.polygon([], {
            opacity: 1,
            color: color,
            fill: color
        }).addTo(lineGroup);
    } else {
        newLine = L.polyline([], {
            opacity: 1,
            color: color
        }).addTo(lineGroup);
    }
    // This is a bit lower than 3000 because we want the whole way
    // to stay on the screen for a bit before moving on.
    var perPt = runSpeed / (2 * way.linestring.length);

    function drawPt(pt) {
        newLine.addLatLng(pt);
        if (way.linestring.length) {
            window.setTimeout(function() {
                drawPt(way.linestring.pop());
            }, perPt);
        } else {
            window.setTimeout(cb, runSpeed / 2);
        }
    }

    newLine.addLatLng(way.linestring.pop());
    drawPt(way.linestring.pop());
}

doDrawWay();
