const path = require('path');
const TerserPlugin = require('terser-webpack-plugin');

module.exports = (env, argv) => {
  const isProduction = argv.mode === 'production';

  return {
    entry: './frontend/main.js',
    output: {
      filename: 'bundle.js',
      path: path.resolve(__dirname, 'public/static'),
    },
    mode: argv.mode || 'development',
    devtool: isProduction ? 'source-map' : 'eval-source-map',
    module: {
      rules: [
        {
          test: /\.css$/,
          use: ['style-loader', 'css-loader'],
        },
      ],
    },
    optimization: {
      minimize: isProduction,
      minimizer: [
        new TerserPlugin({
          terserOptions: {
            format: {
              comments: false,
            },
            compress: {
              drop_console: isProduction,
              drop_debugger: isProduction,
            },
          },
          extractComments: false,
        }),
      ],
    },
    resolve: {
      extensions: ['.js'],
      fallback: {
        // Add any needed polyfills here
        "path": false,
        "fs": false
      }
    },
    performance: {
      hints: isProduction ? 'warning' : false,
      maxEntrypointSize: 512000,
      maxAssetSize: 512000
    },
    stats: {
      modules: false,
      children: false,
      chunks: false,
      assets: true,
    }
  };
}; 