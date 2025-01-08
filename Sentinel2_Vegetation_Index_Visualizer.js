//**********************************************************************
// University of California, Davis - Digital Agriculture Laboratory
// Author: Mohammadreza Narimani
//
// Description:
// This script analyzes and visualizes vegetation indices for a user-defined region over a specified time period using Sentinel-2 data.
// Key functionalities include:
// 1. Drawing Tool: Users can draw polygons on the map to define the Area of Interest (AOI).
// 2. Date Selection: Users can input a date to filter satellite imagery.
// 3. Cloud Masking: Sentinel-2 images are cloud-masked to remove cloudy pixels from the analysis.
// 4. Index Visualization: Displays multiple vegetation indices (NDVI, ARI, mARI, CHL-RED-EDGE, EVI, GNDVI, MCARI, MSI, NDMI, NDWI, NDCI, PSSRb1, SAVI, SIPI, and NDMI_MoistureStress) overlaying Sentinel-2 RGB imagery. Each index is visualized with a corresponding dynamic legend.
// 5. Initial View: The map starts centered on Davis, California.
// 6. Dynamic Legend: A legend is generated dynamically based on the selected vegetation index to assist in data interpretation.
//**********************************************************************

// Set the base map to Google Maps Hybrid (Satellite with labels)
Map.setOptions('HYBRID');

// Set initial map center to Davis, California
var davis = ee.Geometry.Point([-121.7415, 38.5449]);
Map.centerObject(davis, 10);  // Zoom level 10

// Create a drawing tool to allow the user to draw a polygon on the map
var drawingTools = Map.drawingTools();
drawingTools.setShown(true);
drawingTools.setDrawModes(['polygon']);
drawingTools.setLinked(false);

// Variable to store the current AOI
var currentAOI = null;

// Function to clear the map layers
function clearMapLayers() {
  var layers = Map.layers();
  var numLayers = layers.length();
  for (var i = 0; i < numLayers; i++) {
    layers.remove(layers.get(0));  // Remove the first layer iteratively
  }
}

// Function to mask clouds and water in Sentinel-2 images
function maskS2cloud(image) {
  var qa = image.select('QA60');
  var cloudBitMask = 1 << 10;
  var cirrusBitMask = 1 << 11;
  var mask = qa.bitwiseAnd(cloudBitMask).eq(0)
      .and(qa.bitwiseAnd(cirrusBitMask).eq(0));
  return image.updateMask(mask).divide(10000);
}

// Create a dropdown to select NDVI, ARI, mARI, CHL-RED-EDGE, EVI, or MCARI
var indexSelect = ui.Select({
  items: [
    {label: 'Normalized Difference Vegetation Index (NDVI)', value: 'NDVI'},
    {label: 'Anthocyanin Reflectance Index (ARI)', value: 'ARI'},
    {label: 'Modified Anthocyanin Reflectance Index (mARI)', value: 'mARI'},
    {label: 'Chlorophyll Red-Edge (CHL-RED-EDGE)', value: 'CHL-RED-EDGE'},
    {label: 'Enhanced Vegetation Index (EVI)', value: 'EVI'},
    {label: 'Green Normalized Difference Vegetation Index (GNDVI)', value: 'GNDVI' },
    {label: 'Modified Chlorophyll Absorption in Reflectance Index (MCARI)', value: 'MCARI'},
    {label: 'Moisture Stress Index (MSI)', value: 'MSI' },
    {label: 'Normalized Difference Moisture Index (NDMI)', value: 'NDMI' },
    {label: 'Normalized Difference Water Index (NDWI)', value: 'NDWI' },
    {label: 'Normalized Difference Moisture Index for Moisture Stress (NDMISTRESS)', value: 'NDMI_MoistureStress' },
    {label: 'Normalized Difference Chlorophyll Index (NDCI)', value: 'NDCI' },
    {label: 'Pigment Specific Simple Ratio for Chlorophyll B (PSSRb1)', value: 'PSSRb1' },
    {label: 'Soil Adjusted Vegetation Index (SAVI)', value: 'SAVI' },
    {label: 'Structure Insensitive Pigment Index (SIPI)', value: 'SIPI' }
  ],
  placeholder: 'Select index',
  value: 'NDVI', // Default to NDVI
  onChange: runAnalysis
});

// Create a date picker using a textbox for date input
var dateInput = ui.Textbox({
  placeholder: 'Enter date (YYYY-MM-DD)',
  value: '2024-09-01',
  style: {stretch: 'horizontal', padding: '8px'}
});

// Informative labels for user guidance
var dateSupportLabel = ui.Label('Supports from 2019 to Today', {fontWeight: 'bold', margin: '0 0 4px 0'});
var drawInstructionLabel = ui.Label('Draw a Polygon or Use Existing Polygon, then Click Calculate', {fontWeight: 'bold', margin: '4px 0'});

// Create a "Calculate" button to trigger the analysis
var calculateButton = ui.Button({
  label: 'Calculate',
  onClick: runAnalysis,
  style: {stretch: 'horizontal', padding: '8px'}
});

// Create a message panel to display user feedback
var messagePanel = ui.Panel({
  style: {
    position: 'bottom-left',
    padding: '8px',
    width: '300px'
  }
});

// Add a default message to the message panel
messagePanel.add(ui.Label({
  value: 'Ready to calculate. Please draw a polygon.',
  style: {color: 'gray'}
}));
Map.add(messagePanel);

// Create a panel to hold the dropdown, date picker, and button
var controlPanel = ui.Panel({
  widgets: [
    ui.Label('Select Index:'),
    indexSelect,
    dateSupportLabel,
    ui.Label('Select Date:'),
    dateInput,
    drawInstructionLabel,
    calculateButton
  ],
  style: {position: 'top-left', padding: '8px'}
});

// Add the control panel to the map
Map.add(controlPanel);

// Function to run NDVI, ARI, mARI, CHL-RED-EDGE, EVI, or MCARI analysis on the specified geometry
function runAnalysis() {
  // Get the geometry from the drawing tool or use the existing AOI
  var aoi = null;
  if (drawingTools.layers().length() > 0) {
    aoi = drawingTools.layers().get(0).getEeObject();
    currentAOI = aoi; // Update the current AOI
  } else if (currentAOI) {
    aoi = currentAOI; // Use the previously drawn AOI
  } else {
    messagePanel.clear();
    messagePanel.add(ui.Label({
      value: 'Error: Please draw a polygon to define the AOI.',
      style: {color: 'red', fontWeight: 'bold'}
    }));
    return;
  }

  // Get the selected date from the date picker
  var selectedDate = ee.Date(dateInput.getValue());

  // Clear previous layers and hide the drawing tools
  clearMapLayers();
  drawingTools.layers().reset();  // Clear the existing drawings

  // Load Sentinel-2 images, apply masks
  var s2Image = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
                    .filterBounds(aoi)
                    .filterDate(selectedDate.advance(-2, 'month'), selectedDate.advance(2, 'month'))
                    .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 10))
                    .map(maskS2cloud)
                    .mosaic()
                    .clip(aoi);

  // Add Sentinel-2 RGB imagery as the base layer
  var rgbVis = {
    bands: ['B4', 'B3', 'B2'],
    min: 0,
    max: 0.3
  };
  Map.addLayer(s2Image, rgbVis, 'Sentinel-2 RGB');

  // Check the selected index and calculate accordingly
  var selectedIndex = indexSelect.getValue();
  if (selectedIndex === 'NDVI') {
    var ndviLayer = s2Image.normalizedDifference(['B8', 'B4']).rename('NDVI');
    var ndviVis = {
      min: 0,
      max: 1.0,
      palette: ['red', 'yellow', 'green']
    };
    Map.addLayer(ndviLayer, ndviVis, 'NDVI');
    addLegend('NDVI Scale', ndviVis);
  } else if (selectedIndex === 'ARI') {
    var ariLayer = s2Image.expression(
      '(1 / B3) - (1 / B5)',
      {
        'B3': s2Image.select('B3'),
        'B5': s2Image.select('B5')
      }
    ).rename('ARI');
    var ariVis = {
      min: 4.0,
      max: 8.0,
      palette: ['red', 'yellow', 'lime', 'cyan', 'blue']
    };
    Map.addLayer(ariLayer, ariVis, 'ARI');
    addLegend('ARI Scale', ariVis);
  } else if (selectedIndex === 'mARI') {
    var mariLayer = s2Image.expression(
      '((1 / B3) - (1 / B5)) * B7',
      {
        'B3': s2Image.select('B3'),
        'B5': s2Image.select('B5'),
        'B7': s2Image.select('B7')
      }
    ).rename('mARI');
    var mariVis = {
      min: 0.0,
      max: 2.0,
      palette: ['red', 'orange', 'pink', 'violet', 'purple']
    };
    Map.addLayer(mariLayer, mariVis, 'mARI');
    addLegend('mARI Scale', mariVis);
  } else if (selectedIndex === 'CHL-RED-EDGE') {
    var chlrededgeLayer = s2Image.expression(
      '(B7 / B5) - 1',
      {
        'B7': s2Image.select('B7'),
        'B5': s2Image.select('B5')
      }
    ).rename('CHL-RED-EDGE');
    var chlrededgeVis = {
      min: 0.0,
      max: 2.0,
      palette: ['white', 'red', 'orange', 'yellow', 'green', 'black']
    };
    Map.addLayer(chlrededgeLayer, chlrededgeVis, 'CHL-RED-EDGE');
    addLegend('CHL-RED-EDGE Scale', chlrededgeVis);
  } else if (selectedIndex === 'EVI') {
    var eviLayer = s2Image.expression(
      '2.5 * ((B8 - B4) / (B8 + 6 * B4 - 7.5 * B2 + 1))',
      {
        'B8': s2Image.select('B8'),
        'B4': s2Image.select('B4'),
        'B2': s2Image.select('B2')
      }
    ).rename('EVI');
    var eviVis = {
      min: -1,
      max: 1,
      palette: ['blue', 'lightgreen', 'darkgreen']
    };
    Map.addLayer(eviLayer, eviVis, 'EVI');
    addLegend('EVI Scale', eviVis);
  } else if (selectedIndex === 'GNDVI') {
    var gndviLayer = s2Image.normalizedDifference(['B8', 'B3']).rename('GNDVI');
  
    var gndviVis = {
      min: 0,
      max: 1,
      palette: ['white','green']
    };
  
    Map.addLayer(gndviLayer, gndviVis, 'GNDVI');
    addLegend('GNDVI Scale', gndviVis);
  } else if (selectedIndex === 'MCARI') {
    var mcariLayer = s2Image.expression(
      '((B5 - B4) - 0.2 * (B5 - B3)) * (B5 / B4)',
      {
        'B5': s2Image.select('B5'),
        'B4': s2Image.select('B4'),
        'B3': s2Image.select('B3')
      }
    ).rename('MCARI');
    var mcariVis = {
      min: 0,
      max: 0.2,
      palette: ['purple', 'magenta', 'cyan']
    };
    Map.addLayer(mcariLayer, mcariVis, 'MCARI');
    addLegend('MCARI Scale', mcariVis);
  } else if (selectedIndex === 'MSI') {
    var msiLayer = s2Image.expression(
      'B11 / B8',
      {
        'B11': s2Image.select('B11'),
        'B8': s2Image.select('B8')
      }
    ).rename('MSI');
  
    var msiVis = {
      min: 0.4,
      max: 2.0,
      palette: ['blue', 'cyan', 'lime', 'yellow', 'red']
    };
  
    Map.addLayer(msiLayer, msiVis, 'MSI');
    addLegend('MSI Scale', msiVis);
  } else if (selectedIndex === 'NDMI') {
    var ndmiLayer = s2Image.normalizedDifference(['B8A', 'B11']).rename('NDMI');
  
    var ndmiVis = {
      min: -0.8,
      max: 0.8,
      palette: ['#800000', '#ff0000', '#ffff00', '#00ffff', '#0000ff', '#000080']
    };
  
    Map.addLayer(ndmiLayer, ndmiVis, 'NDMI');
    addLegend('NDMI Scale', ndmiVis);
  } else if (selectedIndex === 'NDWI') {
    var ndwiLayer = s2Image.normalizedDifference(['B3', 'B8']).rename('NDWI');
  
    var ndwiVis = {
      min: -0.8,
      max: 0.8,
      palette: ['#008000', '#FFFFFF', '#0000CC']
    };
  
    Map.addLayer(ndwiLayer, ndwiVis, 'NDWI');
    addLegend('NDWI Scale', ndwiVis);
  } else if (selectedIndex === 'NDMI_MoistureStress') {
    var ndmiMoistureLayer = s2Image.normalizedDifference(['B8', 'B11']).rename('NDMI_MoistureStress');
  
    var ndmiMoistureVis = {
      min: -0.8,
      max: 0.8,
      palette: ['#FFFFFF', '#00CCCC', '#007FFF', '#0000B3']
    };
  
    Map.addLayer(ndmiMoistureLayer, ndmiMoistureVis, 'NDMISTRESS');
    addLegend('NDMI for Moisture Stress Scale', ndmiMoistureVis);
  } else if (selectedIndex === 'NDCI') {
    var ndciLayer = s2Image.normalizedDifference(['B5', 'B4']).rename('NDCI');
  
    var ndciVis = {
      min: -0.2,
      max: 0.4,
      palette: ['#313695', '#e0f3f8', '#fdae61', '#a50026']
    };
  
    Map.addLayer(ndciLayer, ndciVis, 'NDCI');
    addLegend('NDCI Scale', ndciVis);
  } else if (selectedIndex === 'PSSRb1') {
    var pssrb1Layer = s2Image.expression('B8 / B4', {
      'B8': s2Image.select('B8'),
      'B4': s2Image.select('B4')
    }).rename('PSSRb1');
  
    var pssrb1Vis = {
      min: 0,
      max: 10,
      palette: ['#FFFFFF', '#66CCFF', '#0000FF']
    };
  
    Map.addLayer(pssrb1Layer, pssrb1Vis, 'PSSRb1');
    addLegend('PSSRb1 Scale', pssrb1Vis);
  } else if (selectedIndex === 'SAVI') {
    var L = 0.428; // Soil brightness correction factor
    var saviLayer = s2Image.expression(
      '(B8 - B4) / (B8 + B4 + L) * (1 + L)', {
        'B8': s2Image.select('B8'),
        'B4': s2Image.select('B4'),
        'L': L
      }
    ).rename('SAVI');
  
    var saviVis = {
      min: -0.5,
      max: 1,
      palette: [
        '#0c0c0c', '#bfbfbf', '#dbdbdb', '#eaeaea', '#fff9cc', '#ede8b5', '#ddd89b',
        '#ccc682', '#bcb76b', '#afc160', '#a3cc59', '#91bf51', '#7fb247', '#70a33f',
        '#609635', '#4f892d', '#3f7c23', '#306d1c', '#216011', '#0f540a', '#004400'
      ]
    };
  
    Map.addLayer(saviLayer, saviVis, 'SAVI');
    addLegend('SAVI Scale', saviVis);
  } else if (selectedIndex === 'SIPI') {
    var sipiLayer = s2Image.expression(
      '(B8 - B1) / (B8 - B4)', {
        'B8': s2Image.select('B8'),
        'B1': s2Image.select('B1'),
        'B4': s2Image.select('B4')
      }
    ).rename('SIPI');
  
    var sipiVis = {
      min: 0.5,
      max: 5,
      palette: [
        '#000000', '#008000', '#00FF00', '#FFFF00', '#CCCCCC', '#FFFFFF'
      ]
    };
  
    Map.addLayer(sipiLayer, sipiVis, 'SIPI');
    addLegend('SIPI Scale', sipiVis);
  }

  // Update message panel
  messagePanel.clear();
  messagePanel.add(ui.Label({
    value: 'Calculation completed successfully.',
    style: {color: 'green', fontWeight: 'bold'}
  }));

  // Re-enable drawing tools for a new polygon
  drawingTools.setShown(true);
}

// Function to clear the existing legend from the map
function clearLegend() {
  if (legend) {
    legend.clear(); // Clear the legend panel's widgets
    Map.remove(legend); // Remove the legend panel from the map
    legend = null; // Reset the legend variable
  }
}

// Global variable to hold the legend panel
var legend = null;

// Function to add a legend for the selected index
function addLegend(title, visParams) {
  clearLegend(); // Clear any existing legend before adding a new one

  legend = ui.Panel({
    style: {
      position: 'bottom-right',
      padding: '8px 15px',
      margin: '0px 0px 0px 0px'
    }
  });

  var legendTitle = ui.Label({
    value: title,
    style: {
      fontWeight: 'bold',
      fontSize: '16px',
      margin: '0 0 4px 0',
      padding: '0',
      textAlign: 'center',
      stretch: 'horizontal'
    }
  });

  var colorBar = ui.Thumbnail({
    image: ee.Image.pixelLonLat().select(0).multiply(visParams.max - visParams.min).add(visParams.min),
    params: {
      bbox: [0, 0, 1, 0.1],
      dimensions: '300x10',
      format: 'png',
      min: visParams.min,
      max: visParams.max,
      palette: visParams.palette
    },
    style: {
      stretch: 'horizontal',
      margin: '0',
      maxWidth: '300px',
      padding: '0'
    }
  });

  var minLabel = ui.Label({
    value: visParams.min.toString(),
    style: {
      margin: '0',
      padding: '0',
      fontSize: '12px',
      textAlign: 'left'
    }
  });

  var maxLabel = ui.Label({
    value: visParams.max.toString(),
    style: {
      margin: '0',
      padding: '0',
      fontSize: '12px',
      textAlign: 'right'
    }
  });

  var labelPanel = ui.Panel({
    widgets: [minLabel, ui.Label('', {stretch: 'horizontal'}), maxLabel],
    layout: ui.Panel.Layout.flow('horizontal'),
    style: {
      stretch: 'horizontal'
    }
  });

  legend.add(legendTitle);
  legend.add(colorBar);
  legend.add(labelPanel);
  Map.add(legend);
}

// Ensure to initialize or clear existing drawings and legend at the start
drawingTools.onDraw(function() {
  drawingTools.setDrawModes(['polygon']);  // Set the drawing mode again for a new polygon
  drawingTools.setShown(true);  // Show the drawing tools again
});
