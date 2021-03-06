/*
* postcss-text-metrics styles parser
* */

/**
 * @name postCSS
 * @type {Object}
 * @property plugin
 * @property process
 * @property decl
 * @property atRule
 * @property rule
 * @property parse
 */

/**
 * @name _
 * @type {Object}
 * @property zipObjectDeep
 * @property mergeWith
 * @property isString
 * @property isNumber
 */

/**
 * @name CorrectionData
 * @type {Object}
 * @property atRule {Object|Null}
 */

import postCSS from 'postcss';
import _ from 'lodash';
import isString from 'lodash/isString';
import font from 'postcss-font-helpers';

/**
 * 
 * @param options {Object} Parser options
 * @param options.dotReplacement {String} String replacement for '.'
 * @param options.textMetrics {Object} An object containing font family corrections.
 * Each key represents a font family name.
 * Each value could be a string, a number or a function.
 * String or Number will be passed through parseInt function.
 * Function will be executed with null context with fontSize and lineHeight values passed as arguments.
 * @return {function(*=)}
 */
const parser = (options = {}) => {
	
	let {
		dotReplacement = '',
		metrics = {}
	} = options;
	
	if (!isString(dotReplacement) || !dotReplacement.length || dotReplacement === '.') {
		dotReplacement = '%dot%';
	}
	
	
	/**
	 * 
	 * @param cssContent {String|String[]} CSS content that should be parsed
	 * @return {Object}
	 */
	return cssContent => {
			const parsedData = [].concat(cssContent).reduce((processedData, css) => {
				
				return _.mergeWith(processedData, parseCSS(css), function (a, b) {
					if (_.isArray(a) && _.isArray(b)) {
						return a.concat(b);
					}
				});
				
			}, {});
			
			return parsedData;
		}
	
	
	/**
	 *
	 * @param css String - valid CSS string.
	 * @return {Object}
	 */
	function parseCSS (css) {
		
		const compiledTypographyData = postCSS.parse(css);
		
		/**
		 * @name compiledTypographyData
		 * @type {Object}
		 * @property walkRules {Function}
		 */
		
		let output = {};
		
		compiledTypographyData.walkRules(rule => {
			
			// @property size {Number|String}
			// @property lineHeight {Number|String}
			// @property family {String[]} Array of font-families
			let {size: fontSize = null, lineHeight = null, family: fontFamily = []} = font(rule);
			
			// At this momement we're ready to process only px-based values.
			if ([fontSize, lineHeight].some(value => {return !value || !_.isString(value) || !~value.indexOf('px')})) {
				// fontSize and lineHeight should not be falsy values, and should include "px" units until more wider support is not created.
				return output;
			}
			
			fontSize = parseInt(fontSize, 10) || 0;
			lineHeight = parseInt(lineHeight, 10) || 0;
			
			// check fontfamily to exist in textMetrics data
			let decreaseBy = null;

			if (_.isArray(fontFamily)) {
				fontFamily.some(name => {
					if (metrics.hasOwnProperty(name)) {
						const {
							fontBoundingBoxAscent,
							fontBoundingBoxDescent,
							hangingBaseline
						} = metrics[name];

						decreaseBy = calculateDecreaseBy({
							fontSize,
							ascent: fontBoundingBoxAscent,
							descent: fontBoundingBoxDescent,
							hanging: hangingBaseline
						});
						//decreaseBy = metrics[name].decreaseBy;
						return true;
					}
					return false;
				});
			}

			// split comma separated selectors, e.g. ".selector1, selector2 {...}"
			const selectorPairs = rule.selector.split(/\s*,\s*/g);
			
			const hasAtRuleParent = rule.parent && rule.parent.type === 'atrule';
			
			const atRuleData = hasAtRuleParent ? {
				name: rule.parent.name,
				params: rule.parent.params
			} : null;
			
			selectorPairs.forEach(pair => {
				
				// get full css selector that should be applied to the final correction selector
				// e.g. '.lang-ko .template' from '.lang-ko .template .p1'
				let pairComponents = pair.split(/\s+/g);
				// the last one selector used in rule selector
				// e.g. '.p1' in '.lang-ko .template .p1'
				let targetSelector = pairComponents.pop();
				let zipPath = targetSelector.replace(/\./g, dotReplacement);
				// rest selectors will be used as correction selector on new rule creation
				let selector = pairComponents.join(' ');
				
				// basically calculate delta based on line-height/font-size difference devided by two as this is correction value of only one side of element.
				let baseDelta = +((lineHeight - fontSize) / 2).toFixed(2);
				let delta = baseDelta;
				// in case decreaseBy variable is specified - try to apply it
				/**
				 * @name decreaseBy
				 * @type {Function|Number|String}
				 */
				let decreaseByValue = 0;
				if (decreaseBy !== null) {
					
					let decreaseByType = Object.prototype.toString.call(decreaseBy).slice(8, -1);
					
					switch (decreaseByType) {
						
						case 'String':
						case 'Number':
							decreaseByValue = parseInt(decreaseBy, 10);
							break;
						
						case 'Function':
							decreaseByValue = decreaseBy.call(null, fontSize, lineHeight);
							break;
					}
					
					if (_.isNumber(decreaseByValue) && isFinite(decreaseByValue)) {
						decreaseByValue = +(decreaseByValue.toFixed(2));
						delta += decreaseByValue;
					}
					
				}
				
				delta = +(delta.toFixed(1));
				
				// create object that will be stored by given path based on selectors
				// this object contains next properties:
				// @property atRule {Object|Null}
				// @property atRule.name {String} atRule name, e.g. "media"
				// @property atRule.params {String} atRule params, e.g. "(max-width: 1499px)"
				// @property selector {String} Full selector that should be added to corrected rule, if necessary, e.g. ".lang-jp .template-homepage"
				// if such selector exists - additional rule with corrected declaration will be created.
				// @property delta {Number} (line-height - font-size) / 2
				// @property fontSize {String} original font-size from parsed rule
				// @property lineHeight {String} original line-height from parsed rule
				let fontData = {
					atRule: atRuleData,
					selector,
					className: targetSelector,
					// line-height minus font-size minus any additional decreaseBy value
					delta,
					baseDelta,
					decreaseBy: decreaseByValue,
					fontSize,
					lineHeight
				};
				
				output = _.mergeWith(output, _.zipObjectDeep([zipPath], [[fontData]]), (a, b) => {
					if (_.isArray(a) && _.isArray(b)) {
						return a.concat(b);
					}
				});
				
			});
			
		});
		
		return output;
	}

	function calculateDecreaseBy ({fontSize = 0, ascent = 0, descent = 0, hanging = 0}) {
		const totalHeight = ascent + descent;
		const diacriticsPercantageValue = +(((totalHeight - Math.abs(hanging)) / totalHeight / 2).toFixed(3));

		return Math.floor(fontSize * diacriticsPercantageValue);
	}
	
}

export default parser;
