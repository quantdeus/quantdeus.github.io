// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// QD Genesis: testnet NFT collectible, NOT an ERC-20 currency.
import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
contract QDGenesisBadge is ERC721, Ownable {
    uint256 public constant MAX_SUPPLY = 10000;
    uint256 public minted;
    string private badgeMetadataURI;
    error SoldOut();
    error EmptyMetadata();
    constructor(string memory metadataURI)
        ERC721("QuantDeus Genesis Badge", "QD")
        Ownable(msg.sender)
    {
        if (bytes(metadataURI).length == 0) revert EmptyMetadata();
        badgeMetadataURI = metadataURI;
    }
    function mintTo(address recipient) external onlyOwner returns (uint256 tokenId) {
        if (minted >= MAX_SUPPLY) revert SoldOut();
        tokenId = ++minted;
        _safeMint(recipient, tokenId);
    }
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        return badgeMetadataURI;
    }
}
