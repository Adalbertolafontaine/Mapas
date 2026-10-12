var wms_layers = [];

var format_provinvias_0 = new ol.format.GeoJSON();
var features_provinvias_0 = format_provinvias_0.readFeatures(json_provinvias_0, 
            {dataProjection: 'EPSG:4326', featureProjection: 'EPSG:3857'});
var jsonSource_provinvias_0 = new ol.source.Vector({
    attributions: ' ',
});
jsonSource_provinvias_0.addFeatures(features_provinvias_0);
var lyr_provinvias_0 = new ol.layer.Vector({
                declutter: false,
                source:jsonSource_provinvias_0, 
                style: style_provinvias_0,
                popuplayertitle: 'provinvias',
                interactive: true,
    title: 'provinvias<br />\
    <img src="styles/legend/provinvias_0_0.png" /> 0.0 - 0.0<br />\
    <img src="styles/legend/provinvias_0_1.png" /> 1 - 3.2<br />\
    <img src="styles/legend/provinvias_0_2.png" /> 3.2 - 5.3<br />\
    <img src="styles/legend/provinvias_0_3.png" /> 5.3 - 7.5<br />\
    <img src="styles/legend/provinvias_0_4.png" /> 7.5 - 10.7<br />\
    <img src="styles/legend/provinvias_0_5.png" /> 10.7 - 50<br />\
    <img src="styles/legend/provinvias_0_6.png" /> 50 - 3564<br />' });

lyr_provinvias_0.setVisible(true);
var layersList = [lyr_provinvias_0];
lyr_provinvias_0.set('fieldAliases', {'OBJECTID': 'OBJECTID', 'PROV': 'PROV', 'TOPONIMIA': 'TOPONIMIA', 'ENLACE': 'ENLACE', 'REG': 'REG', 'Shp_Area': 'Shp_Area', 'ORIG_FID': 'ORIG_FID', 'TIPO': 'TIPO', 'cantidad_cantidad': 'cantidad_cantidad', });
lyr_provinvias_0.set('fieldImages', {'OBJECTID': 'Range', 'PROV': 'TextEdit', 'TOPONIMIA': 'TextEdit', 'ENLACE': 'TextEdit', 'REG': 'TextEdit', 'Shp_Area': 'TextEdit', 'ORIG_FID': 'Range', 'TIPO': 'TextEdit', 'cantidad_cantidad': 'Range', });
lyr_provinvias_0.set('fieldLabels', {'OBJECTID': 'hidden field', 'PROV': 'hidden field', 'TOPONIMIA': 'no label', 'ENLACE': 'hidden field', 'REG': 'hidden field', 'Shp_Area': 'hidden field', 'ORIG_FID': 'hidden field', 'TIPO': 'hidden field', 'cantidad_cantidad': 'no label', });
lyr_provinvias_0.on('precompose', function(evt) {
    evt.context.globalCompositeOperation = 'normal';
});