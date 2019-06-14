// file handling
var currentDocument = require('sketch/dom').getSelectedDocument()

var writeTextToFile = function(text, filePath) {
    var t = [NSString stringWithFormat:@"%@", text],
    f = [NSString stringWithFormat:@"%@", filePath];
    return [t writeToFile:f atomically:true encoding:NSUTF8StringEncoding error:nil];
}

var readTextFromFile = function(filePath) {
    var fileManager = [NSFileManager defaultManager];
    if([fileManager fileExistsAtPath:filePath]) {
        return [NSString stringWithContentsOfFile:filePath encoding:NSUTF8StringEncoding error:nil];
    }
    return nil;
}

var jsonFromFile = function(filePath, mutable) {
    var data = [NSData dataWithContentsOfFile:filePath];
    var options = mutable == true ? NSJSONReadingMutableContainers : 0
    return [NSJSONSerialization JSONObjectWithData:data options:options error:nil];
}

var saveJsonToFile = function(jsonObj, filePath) {
    writeTextToFile(stringify(jsonObj), filePath);
}

var stringify = function(obj, prettyPrinted) {
    var prettySetting = prettyPrinted ? NSJSONWritingPrettyPrinted : 0,
    jsonData = [NSJSONSerialization dataWithJSONObject:obj options:prettySetting error:nil];
    return [[NSString alloc] initWithData:jsonData encoding:NSUTF8StringEncoding];
}

var createTempFolderNamed = function(name) {
    var tempPath = getTempFolderPath(name);
    createFolderAtPath(tempPath);
    return tempPath;
}

var getTempFolderPath = function(withName) {
    var fileManager = [NSFileManager defaultManager],
    cachesURL = [[fileManager URLsForDirectory:NSCachesDirectory inDomains:NSUserDomainMask] lastObject],
    withName = (typeof withName !== 'undefined') ? withName : (Date.now() / 1000),
    folderName = [NSString stringWithFormat:"%@", withName];
    return [[cachesURL URLByAppendingPathComponent:folderName] path];
}

var createFolderAtPath = function(pathString) {
    var fileManager = [NSFileManager defaultManager];
    if([fileManager fileExistsAtPath:pathString]) return true;
    return [fileManager createDirectoryAtPath:pathString withIntermediateDirectories:true attributes:nil error:nil];
}

var removeFileOrFolder = function(filePath) {
    [[NSFileManager defaultManager] removeItemAtPath:filePath error:nil];
}

function exportArtboards(artboards) {
    artboards.forEach(function(selectedArtboard) {
        var name = selectedArtboard.name()
        var comp = compObjectFromArtboard(selectedArtboard)
        log(comp)
        var saveLocation = promptSaveLocation(name)
        saveJsonToFile(comp, saveLocation)
    })
}

function promptSaveLocation(fileName) {

  var saveDialog = NSSavePanel.savePanel()
  saveDialog.setNameFieldStringValue(fileName)
  saveDialog.setAllowedFileTypes(["json"])

  // If the users selects 'OK', return the location they specified
  if (saveDialog.runModal() == NSOKButton)
    return saveDialog.URL().path()
  // Otherwise return nothing
  return nil
}

function compObjectFromArtboard(artboard) {
    // Converts an artboard object into a lottie comp dictionary
    var compName = artboard.name()
    var width = artboard.frame().width()
    var height = artboard.frame().height()

    var layers = artboard.layers()
    
    var lotLayers = []
    var preComps = []
    var index = 0
    layers.forEach(function(layer) {
        var lotLayer = layerObjectFromLayer(layer, index, preComps)
        lotLayers.push(lotLayer)
        index = index + 1

    })
    lotLayers.reverse()
    return {
        assets: [],
        ddd: 0,
        fr: 24,
        h: height,
        ip: 0,
        nm: compName,
        op: 120,
        v: "4.12.0",
        w: width,
        layers: lotLayers,
        assets: preComps
      }
}

function layerObjectFromLayer(layer, index, preComps) {
    if (layer.isMemberOfClass(MSSymbolInstance)) {
        log("Unwrapping Symbol")
        return precompLayerFromSymbolInstance(layer, index, preComps)
    } else {
        return shapeLayerObjectFromLayerGroup(layer, index)
    }
}

function precompLayerFromSymbolInstance(layer, index, preComps) {
    var symbolMaster = layer.symbolMaster()
    var referenceID = layer.symbolID()
    var compObject = compObjectFromArtboard(symbolMaster)
    log("Precomp Comp")
    log(compObject)
    var layers = compObject.layers
    var width = compObject.w
    var height = compObject.h
    var compAsset = {
        "id" : referenceID,
        "layers" : layers
    }

    preComps.push(compAsset)

    var ty = 0
    var name = layer.name()
    var opacity = layer.style().contextSettings().opacity() * 100
    var pX = layer.frame().x()
    var pY = layer.frame().y()
    var scaleX =  (layer.frame().width() / width) * 100
    var scaleY =  (layer.frame().height() / height) * 100
    var rotation = layer.rotation()
    var xform = transformObject(opacity, rotation, [pX, pY, 0], [0, 0, 0], [scaleX,scaleY,100])

    return {
        ddd: 0,
        ind: index,
        ty: ty,
        nm: name,
        ks: xform,
        refId: referenceID,
        w: width,
        h: height,
        ip: 0,
        op: 120,
        st: 0
    }
}

function shapeLayerObjectFromLayerGroup(layer, index) {
    // Converts a layer group into a lot layer dictionary
    var ty = 4 
    var name = layer.name()
    var xform = transformObject(100, 0, [0, 0, 0], [0, 0, 0], [100,100,100])
    var shapes = []
    var groupItems = groupObjectFromGenericLayer(layer)
    shapes.push(groupItems)

    return {
        ddd: 0,
        ind: index,
        ty: ty,
        nm: name,
        ks: xform,
        shapes: [groupItems],
        ip: 0,
        op: 120,
        st: 0
    }
}

function groupObjectFromGenericLayer(layer) {
    log("Retrieving layer shapes")
    /// This func only returns Contents of a lottie layer.
    if ((layer.isMemberOfClass(MSLayerGroup)) &&
        layer.isVisible()) {
        log("Unwrapping Layer Group")
        /// Layer is a group, wrap and extract its sublayers
        return groupObjectFromLayerGroup(layer)
    } else if ((layer.isMemberOfClass(MSShapeGroup)) &&
        layer.isVisible()) {
        log("Unwrapping Shape Group")
        /// Layer is a group, wrap and extract its sublayers
        return groupObjectFromShapeGroup(layer)
    } else if (layer.isVisible()) {
        log("Unwrapping Shape Layer")
        /// A regular child layer, get its contents
        return groupObjectFromShapeLayer(layer)
    }

    
    return {}
}

function groupObjectFromLayerGroup(layerGroup) {
    // Only returns contents for a lot layer wrapped in a group object
    var name = layerGroup.name()
    var items = []

    var children = layerGroup.layers()
    
    children.forEach(function(child) {
        var childItems = groupObjectFromGenericLayer(child)
        items.push(childItems)
    })
    items.reverse()
    // The layers transform node.
    var style = layerGroup.style()
    var aX = layerGroup.frame().width() * 0.5
    var aY = layerGroup.frame().height() * 0.5
    var position = animatableObject([layerGroup.center().x, layerGroup.center().y, 0])
    var origin =  animatableObject([aX, aY, 0])
    var rotation = animatableObject(-layerGroup.rotation())
    var scale = animatableObject([100,100,100])
    var opacity = animatableObject((style.contextSettings().opacity()* 100))
    var transform = {
        ty: "tr",
        nm: "Transform",
        p: position,
        a: origin,
        s: scale,
        r: rotation,
        o: opacity
    }

    // Wrap in a second transform, as sketch has objects rotate around center and not origin (0,0)
    var nestedTransform = {
        ty: "tr",
        nm: "Transform",
        p: animatableObject([-aX, -aY, 0]),
        a: animatableObject([0, 0, 0]),
        s: animatableObject([100,100,100]),
        r: animatableObject(0),
        o: animatableObject(100)
    }
    items.push(nestedTransform)

    // Now wrap everything in a group to transpose coordinate system.
    var it = [{
        ty: "gr",
        nm: "Group",
        it: items
    }, transform]
    
    return {
        ty: "gr",
        nm: name,
        it: it
    }
}

function groupObjectFromShapeGroup(shapeGroup) {
    // Converts a shape groupd into a lottie shape group. 
    // Contains shapes, fills and strokes for the layer, with a final transform node.
    var width = shapeGroup.frame().width()
    var height = shapeGroup.frame().height()
    var name = shapeGroup.name()
    var it = []
    // First add shape point data
    var children = shapeGroup.layers()
    children.forEach(function(child) {
        var pointData = pathObjectFromPathLayer(child, true)
        it.push(pointData)
    })

    var style = shapeGroup.style()
    // then stroke data
    var borders = style.borders()
    var borderOptions = style.borderOptions()

    borders.forEach(function(border) {
        if (border.isEnabled()) {
            var strokeObject = strokeObjectFromBorder(border, borderOptions)
            it.push(strokeObject)
        }
    })

    // Now fill data
    var fills = style.fills()
    fills.forEach(function(fill) {
        if (fill.isEnabled()) {
            var fillObject = fillObjectFromFill(fill, width, height)
            it.push(fillObject)
        }
    })

    // Now wrap everything in a group to transpose center coordinate
    var aX = shapeGroup.frame().width() * 0.5
    var aY = shapeGroup.frame().height() * 0.5

    var nestedTransform = {
        ty: "tr",
        nm: "Transform",
        p: animatableObject([-aX, -aY, 0]),
        a: animatableObject([0, 0, 0]),
        s: animatableObject([100,100,100]),
        r: animatableObject(0),
        o: animatableObject(100)
    }
    it.push(nestedTransform)

    // The Top Level transform node
    var position = animatableObject([shapeGroup.center().x, shapeGroup.center().y, 0])
    var origin =  animatableObject([0, 0, 0])
    var rotation = animatableObject(-shapeGroup.rotation())
    var scale = animatableObject([100,100,100])
    var opacity = animatableObject((style.contextSettings().opacity()* 100))
    var transform = {
        ty: "tr",
        nm: "Transform",
        p: position,
        a: origin,
        s: scale,
        r: rotation,
        o: opacity
    }

    // Now wrap everything in a group to transpose coordinate system.
    var items = [{
        ty: "gr",
        nm: "Contents",
        it: it
    }, transform]

    return {
        ty: "gr",
        nm: name,
        it: items
    }
}

function groupObjectFromShapeLayer(shapeGroup) {
    // Converts a shape groupd into a lottie shape group. 
    // Contains shapes, fills and strokes for the layer, with a final transform node.
    var name = shapeGroup.name()
    var it = []
    // First add shape point data
    var pointData = pathObjectFromPathLayer(shapeGroup, false)
    it.push(pointData)

    var style = shapeGroup.style()
    // then stroke data
    var borders = style.borders()
    var borderOptions = style.borderOptions()

    borders.forEach(function(border) {
        if (border.isEnabled()) {
            var strokeObject = strokeObjectFromBorder(border, borderOptions)
            it.push(strokeObject)
        }
    })

    // Now fill data
    var fills = style.fills()
    fills.forEach(function(fill) {
        if (fill.isEnabled()) {
            var fillObject = fillObjectFromFill(fill)
            it.push(fillObject)
        }
    })

    // Now wrap everything in a group to transpose center coordinate
    var aX = shapeGroup.frame().width() * 0.5
    var aY = shapeGroup.frame().height() * 0.5

    var nestedTransform = {
        ty: "tr",
        nm: "Transform",
        p: animatableObject([-aX, -aY, 0]),
        a: animatableObject([0, 0, 0]),
        s: animatableObject([100,100,100]),
        r: animatableObject(0),
        o: animatableObject(100)
    }
    it.push(nestedTransform)

    // The Top Level transform node
    var position = animatableObject([shapeGroup.center().x, shapeGroup.center().y, 0])
    var origin =  animatableObject([0, 0, 0])
    var rotation = animatableObject(-shapeGroup.rotation())
    var scale = animatableObject([100,100,100])
    var opacity = animatableObject((style.contextSettings().opacity()* 100))
    var transform = {
        ty: "tr",
        nm: "Transform",
        p: position,
        a: origin,
        s: scale,
        r: rotation,
        o: opacity
    }

    // Now wrap everything in a group to transpose coordinate system.
    var items = [{
        ty: "gr",
        nm: "Contents",
        it: it
    }, transform]

    return {
        ty: "gr",
        nm: name,
        it: items
    }
}

function shapeObjectFromShapeLayer(shape) {
    if (shape.isMemberOfClass(MSShapePathLayer) ||
        shape.isMemberOfClass(MSRectangleShape)) {
        return pathObjectFromPathLayer(shape)
    }
    if (shape.isMemberOfClass(MSOvalShape)) {
        return ellipseObjectFromOvalLayer(shape)
    }

    return {}
    // TODO Rect and Oval might not be the place for this.
}

function ellipseObjectFromOvalLayer(ovalLayer) {
    var width = ovalLayer.frame().width()
    var height = ovalLayer.frame().height()
    var name = ovalLayer.name()
    var p = animatableObject([(width * 0.5), (height * 0.5)])
    var size = animatableObject([width, height])
    return {
        ind: 0,
        ty: "el",
        nm: name,
        p: p,
        s: size
    }
}

function pathObjectFromPathLayer(pathLayer, transposePoints) {
    var width = pathLayer.frame().width()
    var height = pathLayer.frame().height()
    var xO = 0
    var yO = 0
    if (transposePoints == true) {
        xO = pathLayer.frame().x()
        yO = pathLayer.frame().y()
    }
    var name = pathLayer.name()
    var isClosed = pathLayer.isClosed()
    var points = pathLayer.points()
    var i = []
    var o = []
    var v = []
    points.forEach(function(pointWrapper) {
        var x = ((pointWrapper.point().x * width) + xO)
        var y = ((pointWrapper.point().y * height) + yO)
        v.push([x, y])
        if (pointWrapper.hasCurveTo()) {
            var iX = ((pointWrapper.curveTo().x * width) + xO)
            var iY = ((pointWrapper.curveTo().y * height) + yO)
            i.push([iX - x, iY - y])
        } else {
            i.push([0,0])
        }
        if (pointWrapper.hasCurveFrom()) {
            var oX = ((pointWrapper.curveFrom().x * width) + xO)
            var oY = ((pointWrapper.curveFrom().y * height) + yO)
            o.push([oX - x, oY - y])
        } else {
            o.push([0,0])
        }
    })

    return {
        ind: 0,
        ty: "sh",
        nm: name,
        ks: {
            a: 0,
            k: {
                i: i,
                o: o,
                v: v,
                c: isClosed
            }
        }
    }
}

function strokeObjectFromBorder(border, borderOptions) {

    var lineCap = borderOptions.lineCapStyle() + 1
    var lineJoin = borderOptions.lineJoinStyle() + 1
    var width = animatableObject(border.thickness())
    var opacity = animatableObject((border.contextSettings().opacity() * 100))

    var color = animatableObject([border.color().red(), border.color().green(), border.color().blue(), border.color().alpha()])
    return {
        ty: "st",
        c: color,
        o: opacity,
        w: width,
        lc: lineCap,
        lj: lineJoin,
        nm: "Stroke"

    }
}

function fillObjectFromFill(fill, width, height) {
    var opacity = animatableObject((fill.contextSettings().opacity()  * 100))
    var color = animatableObject([fill.color().red(), fill.color().green(), fill.color().blue(), fill.color().alpha()])

    var fillType = fill.fillType()
    var gradient = fill.gradient()
    var gradientType = gradient.gradientType()
    
    var gradientStops = gradient.stops()
    var gradientStopsLength = gradientStops.length
    var gradientStopsValue = []
    for(var i = 0; i < gradientStopsLength; i++) {
        gradientStopsValue.push(gradientStops[i].position())
        gradientStopsValue.push(gradientStops[i].color().red())
        gradientStopsValue.push(gradientStops[i].color().green())
        gradientStopsValue.push(gradientStops[i].color().blue())
    }
    gradientStopsValue = animatableObject(gradientStopsValue)

    // from & to value must be converted to absolute value because of the lottie gradientUnits attribute is 'userSpaceOnUse'
    var gradientLinearForm = animatableObject([gradient.from().x * width, gradient.from().y * height])
    var gradientLinearTo = animatableObject([gradient.to().x * width, gradient.to().y * height])

    if ( fillType === 1 ) { // 0 : Color | 1 : Gradient
        if ( gradientType === 0 ) { // 0 : Linear | 1 : Radial
            return {
                ty: "gf",
                nm: "gFill",
                g: {
                    p: gradientStopsLength,
                    k: gradientStopsValue
                },
                o: opacity,
                t: 1,
                s: gradientLinearForm,
                e: gradientLinearTo
            }  
        } else {
            return {
                ty: "gf",
                nm: "gFill",
                g: {
                    p: gradientStopsLength,
                    k: gradientStopsValue
                },
                o: opacity,
                t: 2,
                s: gradientLinearForm,
                e: gradientLinearTo,
                h: {
                    k: 0
                },
                a: {
                    k: 0
                }
            }
        }
    } else {
        return {
            ty: "fl",
            nm: "Fill",
            c: color,
            o: opacity
        }
    }
    
}

// Primitives

function transformObject(opacity, rotation, position, anchor, scale) {
    var oK = animatableObject(opacity)
    var rK = animatableObject(rotation)
    var pK = animatableObject(position)
    var aK = animatableObject(anchor)
    var sK = animatableObject(scale)
    return {
        o: oK,
        r: rK,
        p: pK,
        a: aK,
        s: sK
    }
}

function animatableObject(value) {
    return { 
        k: value
    }
}

