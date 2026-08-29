let previewCharacter = null;

function initCustomizeScreen() {
    const container = document.getElementById('customize-preview');
    container.innerHTML = '';
    previewCharacter = new CubeCharacter(container, window.gameState.characterConfig, 'player-left');

    const input = document.getElementById('color-body');
    input.value = window.gameState.characterConfig.color;
    input.oninput = () => {
        window.gameState.characterConfig.color = input.value;
        previewCharacter.setColors(window.gameState.characterConfig);
    };
}

document.getElementById('confirm-character-btn').addEventListener('click', async () => {
    await window.hubConnectionStarted;
    await window.hubConnection.invoke('JoinLobby', window.gameState.playerName, window.gameState.characterConfig);
    showScreen('lobby');
});