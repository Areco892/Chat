module.exports = function handler(request, response) {
  response.status(200).json({
    chatServerUrl: process.env.CHAT_SERVER_URL || ""
  });
};
