module.exports = {
  entry: {
    renderer: "./src/renderer/index.tsx",
    dialogs: "./src/renderer/views/dialogs/DialogIndex.tsx",
    test: "./src/test/index.ts",
  },
  output: {
    path: "./dist/assets",
    publicPath: "/assets/",
    filename: '[name].js',
  },
  target: "electron-renderer",
  node: {
    __filename: false,
    __dirname: false,
  },
  externals: {
    "glslify": "undefined", // glslify will be transformed with babel-plugin-glslify so don't have to be required
  },
  resolve: {
    extensions: ["", ".ts", ".tsx", ".js"],
  },
  module: {
    loaders: [
      {
        test: /\.json$/,
        loader: 'json-loader'
      },
      {
        test: /\.tsx?$/,
        exclude: /\/test\//,
        loader: "babel-loader?plugins[]=glslify!ts-loader",
      },
      {
        test: /\.tsx?$/,
        include: /\/test\//,
        loader: "babel-loader?plugins[]=espower!ts-loader",
      },
      {
        test: /\.css$/,
        loader: 'style-loader!css-loader?importLoaders=1!postcss-loader'
      },
      {
        test: /\.(jpg|png|woff|woff2|eot|ttf|svg)/,
        loader: 'url-loader?limit=10000'
      }
    ],
  },
  plugins: [
    require("webpack-fail-plugin"),
  ],
  postcss: function(webpack) {
    return [
      require('postcss-import')({
        addDependencyTo: webpack
      }),
      require('postcss-url'),
      require('postcss-cssnext')({
        features: {
          customProperties: false,
        },
      }),
    ];
  },
  devtool: "inline-source-map",
  devServer: {
    contentBase: './dist',
    port: 23000,
    inline: true,
  },
}
