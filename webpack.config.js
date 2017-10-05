var webpack = require('webpack');
var path = require('path');

module.exports = {
	entry: './src/index',
	output: {
		path: path.resolve(__dirname, 'dist'),
		filename: 'index.js',
	},
	module: {
		rules: [{
			test: /\.js$/,
			exclude: /node_modules/,
			loader: 'babel-loader'
		}]
	},
	devtool: ''
};